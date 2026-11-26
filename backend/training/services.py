"""Who sees which course, how far each teacher is, test attempts and the
certificate.

A module is open once the one before it is passed; it is passed when its
lessons are all marked read and (if it has a test) the best attempt reached
the course's pass mark. All modules passed: the certificate is issued — once.
Progress is always worked out from the marks and attempts, never stored, so
a module added to a course later simply becomes the next step.
"""

import random
import secrets
from collections import defaultdict
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.db.models import Count, Max, Prefetch, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from learning.grading import grade_attempt, question_to_item
from learning.models import Question
from notifications.models import Kind as NotifyKind
from notifications.service import notify

from .models import Certificate, Course, CourseLesson, Enrollment, LessonDone, Module, TrainingAttempt

QUESTION_FIELDS = ('kind', 'topic', 'text', 'image_url', 'options', 'correct', 'answer_value', 'tolerance_pct',
                   'unit', 'explanation', 'points')
OPEN_ATTEMPT_REUSE = timedelta(hours=3)
CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'  # no 0/O, 1/I

_rng = random.SystemRandom()


# ── Who ─────────────────────────────────────────────────────────────────

def can_edit(user) -> bool:
    return bool(user and user.is_authenticated and user.is_admin)


def is_learner(user) -> bool:
    """Teachers (and admins, who may take a course too) — not the read-only
    roles, who only look."""
    return bool(
        user and user.is_authenticated and user.is_staff_member
        and not user.is_observer and not user.is_school_admin
    )


def teacher_kinds(user) -> set[str]:
    from schools.models import SchoolTeacher

    return set(SchoolTeacher.objects.filter(teacher=user).values_list('kind', flat=True))


def visible_courses(user, fan=None):
    """`fan`: the window asked from (common/subjects.window) — that fan's
    courses and those for both."""
    qs = Course.objects.all()
    if fan:
        qs = qs.filter(Q(subject='') | Q(subject=fan))
    if can_edit(user):
        return qs
    qs = qs.filter(is_published=True)
    if user.is_oversight:
        return qs
    from common.subjects import subjects_for

    # courses for both fanlar (blank) or the teacher's own; one they were
    # put on stays theirs whatever its fan
    fan = Q(subject='') | Q(subject__in=subjects_for(user))
    return qs.filter(
        (fan & (Q(audience=Course.Audience.ALL) | Q(audience__in=teacher_kinds(user)))) | Q(enrollments__user=user)
    ).distinct()


# ── Progress ────────────────────────────────────────────────────────────

def modules_of(courses) -> dict[int, list[Module]]:
    out = defaultdict(list)
    rows = (
        Module.objects.filter(course__in=list(courses)).order_by('order', 'id')
        .prefetch_related(Prefetch('lessons', queryset=CourseLesson.objects.order_by('order', 'id')))
    )
    for m in rows:
        out[m.course_id].append(m)
    return out


def marks_of(user_ids, courses):
    """({user: {lesson ids read}}, {user: {module: (best %, attempts)}})."""
    courses = list(courses)
    done = defaultdict(set)
    for uid, lid in LessonDone.objects.filter(user_id__in=user_ids, lesson__module__course__in=courses) \
            .values_list('user_id', 'lesson_id'):
        done[uid].add(lid)
    best = defaultdict(dict)
    rows = (
        TrainingAttempt.objects.filter(user_id__in=user_ids, module__course__in=courses, submitted_at__isnull=False)
        .values('user', 'module').annotate(best=Max('percent'), n=Count('id'))
    )
    for r in rows:
        best[r['user']][r['module']] = (r['best'], r['n'])
    return done, best


def evaluate(course, modules, done: set, best: dict) -> list[dict]:
    """Each module's state for one teacher, in order."""
    out, prev_passed = [], True
    for m in modules:
        lessons = list(m.lessons.all())
        read = [lesson.id for lesson in lessons if lesson.id in done]
        has_test = bool(m.questions)
        best_pct, attempts = best.get(m.id, (None, 0))
        lessons_done = len(read) == len(lessons)
        # a module with neither lessons nor a test is still being written
        empty = not lessons and not has_test
        passed = not empty and lessons_done and (not has_test or (best_pct is not None and best_pct >= course.pass_percent))
        locked = not prev_passed
        out.append({
            'module': m, 'lessons': lessons, 'read': set(read), 'locked': locked, 'passed': passed,
            'lessons_done': lessons_done, 'has_test': has_test, 'best_percent': best_pct, 'attempts': attempts,
            'test_open': not locked and lessons_done and has_test,
        })
        prev_passed = passed
    return out


def summary(states: list[dict]) -> dict:
    total = len(states)
    passed = sum(1 for s in states if s['passed'])
    lessons = sum(len(s['lessons']) for s in states)
    read = sum(len(s['read']) for s in states)
    steps = lessons + sum(1 for s in states if s['has_test'])
    done_steps = read + sum(1 for s in states if s['has_test'] and s['passed'])
    return {
        'modules_total': total, 'modules_passed': passed, 'lessons_total': lessons, 'lessons_read': read,
        'percent': round(100 * done_steps / steps) if steps else 0,
        'completed': bool(total) and passed == total,
    }


def progress_for(user, courses) -> dict[int, list[dict]]:
    courses = list(courses)
    mods = modules_of(courses)
    done, best = marks_of([user.id], courses)
    return {c.id: evaluate(c, mods[c.id], done[user.id], best[user.id]) for c in courses}


def state_of(user, module: Module) -> dict:
    course = module.course
    for s in progress_for(user, [course])[course.id]:
        if s['module'].id == module.id:
            return s
    raise ValidationError({'detail': 'Modul topilmadi.'})


# ── Doing the course ────────────────────────────────────────────────────

def ensure_enrollment(user, course) -> Enrollment:
    enrollment, _ = Enrollment.objects.get_or_create(user=user, course=course)
    return enrollment


def mark_lesson(user, lesson: CourseLesson):
    state = state_of(user, lesson.module)
    if state['locked']:
        raise ValidationError({'detail': "Bu modul hali ochilmagan: avval oldingi modulni tugating."})
    ensure_enrollment(user, lesson.module.course)
    LessonDone.objects.get_or_create(user=user, lesson=lesson)
    return complete_if_done(user, lesson.module.course)


def module_items(module: Module) -> list[dict]:
    """A fresh attempt's questions: drawn from the bank when the module asks
    for fewer than it holds, in a random order, options shuffled."""
    questions = []
    for i, data in enumerate(module.questions or []):
        q = Question(**{k: data[k] for k in QUESTION_FIELDS if data.get(k) is not None})
        q.id = i + 1
        questions.append(q)
    if module.test_size and module.test_size < len(questions):
        questions = _rng.sample(questions, module.test_size)
    _rng.shuffle(questions)
    return [question_to_item(q) for q in questions]


def start_test(user, module: Module) -> TrainingAttempt:
    state = state_of(user, module)
    if state['locked']:
        raise ValidationError({'detail': "Bu modul hali ochilmagan: avval oldingi modulni tugating."})
    if not state['has_test']:
        raise ValidationError({'detail': "Bu modulda test yo'q."})
    if not state['lessons_done']:
        raise ValidationError({'detail': "Testdan oldin modulning barcha darslarini o'qing."})
    ensure_enrollment(user, module.course)
    existing = (
        TrainingAttempt.objects.filter(user=user, module=module, submitted_at__isnull=True,
                                       started_at__gte=timezone.now() - OPEN_ATTEMPT_REUSE)
        .order_by('-started_at').first()
    )
    if existing:
        return existing
    return TrainingAttempt.objects.create(user=user, module=module, snapshot=module_items(module))


def submit_test(attempt: TrainingAttempt, answers):
    """Grades the attempt; returns (passed, certificate issued just now)."""
    if attempt.submitted_at:
        raise ValidationError({'detail': 'Bu urinish allaqachon topshirilgan.'})
    grade_attempt(attempt, answers)
    attempt.save()
    course = attempt.module.course
    passed = attempt.percent >= course.pass_percent
    return passed, (complete_if_done(attempt.user, course) if passed else None)


# ── Certificate ─────────────────────────────────────────────────────────

def _code() -> str:
    return ''.join(secrets.choice(CODE_ALPHABET) for _ in range(10))


def _next_number(year: int) -> str:
    last = (
        Certificate.objects.filter(number__startswith=f'{year}-').order_by('-number')
        .values_list('number', flat=True).first()
    )
    seq = int(last.split('-')[1]) + 1 if last else 1
    return f'{year}-{seq:05d}'


def complete_if_done(user, course) -> Certificate | None:
    """Issues the certificate the moment the last module is passed; None if
    the course isn't finished yet or the teacher already holds it."""
    if Certificate.objects.filter(user=user, course=course).exists():
        return None
    states = progress_for(user, [course])[course.id]
    if not states or not all(s['passed'] for s in states):
        return None
    tested = [s['best_percent'] for s in states if s['has_test'] and s['best_percent'] is not None]
    percent = round(sum(tested) / len(tested), 1) if tested else 100.0
    year = timezone.localdate().year
    cert = None
    for _ in range(5):
        try:
            with transaction.atomic():
                cert = Certificate.objects.create(
                    user=user, course=course, course_title=course.title, name=user.name, hours=course.hours,
                    percent=percent, number=_next_number(year), code=_code(),
                )
            break
        except IntegrityError:
            if Certificate.objects.filter(user=user, course=course).exists():
                return None  # a parallel request issued it
    if cert is None:
        return None
    Enrollment.objects.filter(user=user, course=course, completed_at__isnull=True).update(completed_at=cert.issued_at)
    if not Enrollment.objects.filter(user=user, course=course).exists():
        Enrollment.objects.create(user=user, course=course, completed_at=cert.issued_at)
    from feed.services import auto_post

    auto_post(user, f"🎓 {user.name} «{course.title}» malaka oshirish kursini tugatib, sertifikat oldi.", f'cert:{cert.id}')
    notify(
        user, NotifyKind.MALAKA, 'Sertifikat berildi',
        f"«{course.title}» kursini tugatdingiz — sertifikat №{cert.number}.", url=f'/training?cert={cert.id}',
        fan=course.subject,
    )
    return cert


# ── Administration ──────────────────────────────────────────────────────

def assign(course, users, by, due_on=None) -> dict:
    """Puts teachers on a course; the ones newly put there are told."""
    existing = {e.user_id: e for e in Enrollment.objects.filter(course=course, user__in=users)}
    fresh, updated = [], 0
    for u in users:
        e = existing.get(u.id)
        if e is None:
            fresh.append(Enrollment(user=u, course=course, assigned_by=by, due_on=due_on))
        elif e.due_on != due_on or e.assigned_by_id is None:
            e.due_on, e.assigned_by = due_on, e.assigned_by or by
            e.save(update_fields=['due_on', 'assigned_by'])
            updated += 1
    Enrollment.objects.bulk_create(fresh, ignore_conflicts=True)
    if fresh:
        when = f" Muddat: {due_on:%d.%m.%Y}." if due_on else ''
        notify(
            [e.user for e in fresh], NotifyKind.MALAKA, 'Yangi malaka oshirish kursi',
            f"Sizga «{course.title}» kursi biriktirildi.{when}", url=f'/training/{course.id}', fan=course.subject,
        )
    return {'assigned': len(fresh), 'updated': updated}


def people_rows(course, users) -> list[dict]:
    """One row per teacher: how far they are on this course."""
    users = list(users)
    mods = modules_of([course])[course.id]
    done, best = marks_of([u.id for u in users], [course])
    enrollments = {e.user_id: e for e in Enrollment.objects.filter(course=course, user__in=users)}
    certs = {c.user_id: c for c in Certificate.objects.filter(course=course, user__in=users)}
    today = timezone.localdate()
    rows = []
    for u in users:
        s = summary(evaluate(course, mods, done[u.id], best[u.id]))
        e, c = enrollments.get(u.id), certs.get(u.id)
        rows.append({
            'user': u.id, 'name': u.name, 'photo': u.photo.url if u.photo else None,
            **s,
            'completed': bool(c) or s['completed'],
            'assigned': bool(e and e.assigned_by_id), 'due_on': e.due_on if e else None,
            'overdue': bool(e and e.due_on and e.due_on < today and not c),
            'started_at': e.created_at if e else None,
            'certificate': {'id': c.id, 'number': c.number, 'percent': c.percent} if c else None,
        })
    rows.sort(key=lambda r: (r['completed'], -r['percent'], r['name']))
    return rows


DUE_REMIND_AT = (3, 1, 0)


def send_due_reminders(day=None) -> int:
    """Hourly (the bot): a teacher whose assigned course is due in 3 days,
    tomorrow or today and isn't finished hears it — each mark once."""
    day = day or timezone.localdate()
    horizon = day + timedelta(days=max(DUE_REMIND_AT))
    sent = 0
    rows = (
        Enrollment.objects.select_related('user', 'course')
        .filter(due_on__isnull=False, due_on__gte=day, due_on__lte=horizon, completed_at__isnull=True,
                user__is_active=True, course__is_published=True)
    )
    for e in rows:
        left = (e.due_on - day).days
        due = [d for d in DUE_REMIND_AT if left <= d and d not in (e.reminded or [])]
        if not due:
            continue
        if Certificate.objects.filter(user=e.user, course=e.course).exists():
            continue
        mark = min(due)
        when = 'bugun tugaydi' if left == 0 else ('ertaga tugaydi' if left == 1 else f'{left} kundan keyin tugaydi')
        notify(e.user, NotifyKind.MALAKA, f"«{e.course.title}» kursi muddati {when}",
               f"Muddat: {e.due_on:%d.%m.%Y}", url=f'/training/{e.course_id}',
               dedupe_key=f'training-due:{e.id}:{mark}', fan=e.course.subject)
        e.reminded = sorted({*(e.reminded or []), *due})
        e.save(update_fields=['reminded'])
        sent += 1
    return sent
