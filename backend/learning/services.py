import math
from datetime import timedelta

from django.db.models import Count, Max, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from accounts.models import User

from .grading import grade_attempt, public_item, question_to_item
from .models import Assignment, Attempt, LessonProgress, Question, StudentProfile

PRACTICE_MAX_QUESTIONS = 20
OPEN_ATTEMPT_REUSE = timedelta(hours=3)


# ── Access helpers ─────────────────────────────────────────────────────

def student_profile_or_404(student_id) -> StudentProfile:
    profile = (
        StudentProfile.objects.select_related('user', 'journal_class', 'journal_class__teacher')
        .filter(user_id=student_id, user__role=User.Role.STUDENT)
        .first()
    )
    if not profile:
        raise NotFound("O'quvchi topilmadi.")
    return profile


def can_view_student(viewer, profile: StudentProfile) -> bool:
    if viewer.is_oversight:
        return True
    jc = profile.journal_class
    return bool(jc and jc.teacher_id == viewer.id)


def can_manage_student(viewer, profile: StudentProfile) -> bool:
    if viewer.is_observer:
        return False
    if viewer.is_admin:
        return True
    jc = profile.journal_class
    return bool(jc and jc.teacher_id == viewer.id)


def visible_students(viewer):
    """Student users `viewer` may see results for: oversight -> everyone,
    a teacher -> the students in their own classes."""
    qs = User.objects.filter(role=User.Role.STUDENT)
    if viewer.is_oversight:
        return qs
    return qs.filter(student_profile__journal_class__teacher=viewer)


# ── Question sets ──────────────────────────────────────────────────────

def lesson_bank(lesson_id):
    return Question.objects.filter(lesson_id=lesson_id, audience=Question.Audience.STUDENT, assignment__isnull=True)


def assignment_questions(assignment: Assignment) -> list[Question]:
    questions = []
    if assignment.include_lesson_questions and assignment.lesson_id:
        questions += list(lesson_bank(assignment.lesson_id).order_by('order', 'id'))
    questions += list(assignment.custom_questions.order_by('order', 'id'))
    return questions


# ── Attempts ───────────────────────────────────────────────────────────

def _start(user, kind, items, *, lesson=None, assignment=None) -> Attempt:
    if not items:
        raise ValidationError({'detail': "Bu yerda hali savollar yo'q."})
    return Attempt.objects.create(user=user, kind=kind, lesson=lesson, assignment=assignment, snapshot=items)


def _open_attempt(user, **filters):
    return (
        Attempt.objects.filter(user=user, submitted_at__isnull=True, started_at__gte=timezone.now() - OPEN_ATTEMPT_REUSE, **filters)
        .order_by('-started_at')
        .first()
    )


def start_practice(user, lesson) -> Attempt:
    existing = _open_attempt(user, kind=Attempt.Kind.PRACTICE, lesson=lesson)
    if existing:
        return existing
    questions = list(lesson_bank(lesson.id).order_by('?')[:PRACTICE_MAX_QUESTIONS])
    questions.sort(key=lambda q: (q.order, q.id))
    return _start(user, Attempt.Kind.PRACTICE, [question_to_item(q) for q in questions], lesson=lesson)


def start_homework(user, assignment: Assignment) -> Attempt:
    existing = _open_attempt(user, kind=Attempt.Kind.HOMEWORK, assignment=assignment)
    if existing:
        return existing
    used = Attempt.objects.filter(user=user, assignment=assignment, submitted_at__isnull=False).count()
    if used >= assignment.max_attempts:
        raise ValidationError({'detail': "Urinishlar soni tugagan."})
    items = [question_to_item(q) for q in assignment_questions(assignment)]
    return _start(user, Attempt.Kind.HOMEWORK, items, lesson=assignment.lesson, assignment=assignment)


def attempt_payload(attempt: Attempt) -> dict:
    """What a client may see of an in-progress attempt — no answers."""
    return {
        'id': attempt.id,
        'kind': attempt.kind,
        'started_at': attempt.started_at,
        'lesson': attempt.lesson_id,
        'assignment': attempt.assignment_id,
        'questions': [public_item(i) for i in attempt.snapshot],
    }


def submit_attempt(attempt: Attempt, answers) -> Attempt:
    if attempt.submitted_at:
        raise ValidationError({'detail': "Bu urinish allaqachon topshirilgan."})
    grade_attempt(attempt, answers)
    if attempt.assignment_id and attempt.assignment.due_at and attempt.submitted_at > attempt.assignment.due_at:
        attempt.is_late = True
    attempt.save()
    if attempt.lesson_id and attempt.kind in (Attempt.Kind.PRACTICE, Attempt.Kind.HOMEWORK):
        progress, _ = LessonProgress.objects.get_or_create(user=attempt.user, lesson_id=attempt.lesson_id)
        if progress.best_percent is None or attempt.percent > progress.best_percent:
            progress.best_percent = attempt.percent
        if attempt.percent >= 60 and not progress.completed_at:
            progress.completed_at = timezone.now()
        progress.save()
    return attempt


def reveal_answers(attempt: Attempt, viewer) -> bool:
    if viewer.id != attempt.user_id:
        return True  # teacher / administration reviewing
    if attempt.kind != Attempt.Kind.HOMEWORK or not attempt.assignment_id:
        return True
    policy = attempt.assignment.show_answers
    if policy == Assignment.ShowAnswers.NEVER:
        return False
    if policy == Assignment.ShowAnswers.AFTER_DUE:
        return attempt.assignment.is_overdue
    return True


# ── XP / levels ────────────────────────────────────────────────────────

def student_xp(user) -> dict:
    """Points shown on the student dashboard — derived from graded work
    only (best attempt per homework, best practice per lesson, completed
    lessons), never from client-reported game scores."""
    submitted = Attempt.objects.filter(user=user, submitted_at__isnull=False)
    hw = submitted.filter(kind=Attempt.Kind.HOMEWORK).values('assignment').annotate(best=Max('percent'))
    pr = submitted.filter(kind=Attempt.Kind.PRACTICE).values('lesson').annotate(best=Max('percent'))
    completed = LessonProgress.objects.filter(user=user, completed_at__isnull=False).count()
    xp = int(sum(r['best'] or 0 for r in hw) + 0.5 * sum(r['best'] or 0 for r in pr) + 20 * completed)
    level = int(math.sqrt(xp / 100)) + 1
    next_level_xp = (level ** 2) * 100
    prev_level_xp = ((level - 1) ** 2) * 100
    return {
        'xp': xp,
        'level': level,
        'level_progress': round(100 * (xp - prev_level_xp) / max(1, next_level_xp - prev_level_xp)),
        'next_level_xp': next_level_xp,
        'lessons_completed': completed,
    }


def class_leaderboard(journal_class, limit=50) -> list[dict]:
    rows = (
        Attempt.objects.filter(
            user__student_profile__journal_class=journal_class, submitted_at__isnull=False,
            kind__in=[Attempt.Kind.HOMEWORK, Attempt.Kind.PRACTICE],
        )
        .values('user', 'user__name')
        .annotate(n=Count('id'), total=Sum('percent'))
    )
    out = []
    for r in rows:
        avg = (r['total'] or 0) / r['n'] if r['n'] else 0
        # Same Bayesian shrink as the admin ranking, so one lucky 100% on a
        # single attempt doesn't top the class.
        score = (3 * 60 + (r['total'] or 0)) / (3 + r['n'])
        out.append({'user': r['user'], 'name': r['user__name'], 'attempts': r['n'], 'avg': round(avg, 1), 'score': round(score, 1)})
    out.sort(key=lambda x: (-x['score'], -x['attempts']))
    for i, row in enumerate(out, start=1):
        row['rank'] = i
    return out[:limit]


def homework_status(user, assignment, attempts_by_assignment) -> dict:
    mine = attempts_by_assignment.get(assignment.id, [])
    submitted = [a for a in mine if a.submitted_at]
    best = max((a.percent for a in submitted), default=None)
    if submitted:
        state = 'submitted'
    elif any(not a.submitted_at for a in mine):
        state = 'in_progress'
    elif assignment.is_overdue:
        state = 'overdue'
    else:
        state = 'todo'
    return {
        'state': state,
        'attempts_used': len(submitted),
        'best_percent': best,
        'last_attempt': max(submitted, key=lambda a: a.submitted_at).id if submitted else None,
    }


def assignment_progress_counts(assignment_ids) -> dict:
    rows = (
        Attempt.objects.filter(assignment_id__in=assignment_ids, submitted_at__isnull=False)
        .values('assignment')
        .annotate(students=Count('user', distinct=True), avg=Sum('percent'), n=Count('id'))
    )
    return {
        r['assignment']: {'submitted': r['students'], 'avg_percent': round((r['avg'] or 0) / r['n'], 1) if r['n'] else None}
        for r in rows
    }


def class_student_counts(class_ids) -> dict:
    rows = (
        StudentProfile.objects.filter(journal_class_id__in=class_ids, user__approved=True, user__is_active=True)
        .values('journal_class')
        .annotate(n=Count('id'))
    )
    return {r['journal_class']: r['n'] for r in rows}


def active_since(days=7):
    return timezone.now() - timedelta(days=days)


def pending_homework_q(user):
    return Q(journal_class=user.student_profile.journal_class, is_published=True)
