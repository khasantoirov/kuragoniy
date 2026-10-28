"""Data analysis behind the rankings and the administration dashboard.

Rankings use a Bayesian average (shrink toward the overall mean by a few
"phantom" observations) so one lucky 100% — or one 5-star report — can't
outrank someone with a long consistent record. Every score is broken into
its components in the response, so the UI can show *why* someone ranks
where they do; nothing is a black box.

Only server-graded data feeds these numbers: client-reported mini-game
scores are deliberately left out.
"""

from collections import defaultdict
from datetime import timedelta

from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncWeek
from django.utils import timezone

from accounts.models import User
from journal.models import JournalClass
from lessons.models import Lesson

from .models import Assignment, Attempt, LessonMaterial, LessonReport, StudentProfile

STUDENT_PRIOR_MEAN = 60.0
STUDENT_PRIOR_WEIGHT = 3
RATING_PRIOR_MEAN = 3.5
RATING_PRIOR_WEIGHT = 2

PERIODS = {'week': 7, 'month': 30, 'quarter': 90, 'year': 365}


def period_start(period: str | None):
    days = PERIODS.get(period or 'month')
    return timezone.now() - timedelta(days=days) if days else None


def bayes(total, n, prior_mean, prior_weight):
    return (prior_weight * prior_mean + (total or 0)) / (prior_weight + (n or 0))


def _weighted(parts: list[tuple[float | None, float]]) -> float:
    """Weighted mean over the components that exist — a teacher with no
    lesson reports yet isn't scored as if they had a 0 rating."""
    present = [(v, w) for v, w in parts if v is not None]
    if not present:
        return 0.0
    total_w = sum(w for _, w in present)
    return sum(v * w for v, w in present) / total_w


def _school_filter(prefix, school_id):
    """A partner school (Statistika's filter) — 'none': classes linked to none."""
    if school_id == 'none':
        return {f'{prefix}partner_school__isnull': True}
    return {f'{prefix}partner_school_id': school_id} if school_id else {}


def scope_profiles(viewer, *, teacher_id=None, class_id=None, grade=None, school_id=None):
    qs = StudentProfile.objects.filter(user__role=User.Role.STUDENT, user__is_active=True, user__approved=True)
    if not viewer.is_oversight:
        qs = qs.filter(journal_class__teacher=viewer)
    elif teacher_id:
        qs = qs.filter(journal_class__teacher_id=teacher_id)
    qs = qs.filter(**_school_filter('journal_class__', school_id))
    if class_id:
        qs = qs.filter(journal_class_id=class_id)
    if grade:
        qs = qs.filter(grade=grade)
    return qs


def scope_classes(viewer, *, teacher_id=None, school_id=None):
    qs = JournalClass.objects.filter(**_school_filter('', school_id))
    if not viewer.is_oversight:
        return qs.filter(teacher=viewer)
    if teacher_id:
        qs = qs.filter(teacher_id=teacher_id)
    return qs


def overview(viewer, since, **scope):
    profiles = scope_profiles(viewer, **scope)
    student_ids = list(profiles.values_list('user_id', flat=True))
    attempts = Attempt.objects.filter(
        user_id__in=student_ids, submitted_at__isnull=False, kind__in=[Attempt.Kind.HOMEWORK, Attempt.Kind.PRACTICE],
    )
    period_attempts = attempts.filter(submitted_at__gte=since) if since else attempts
    agg = period_attempts.aggregate(n=Count('id'), avg=Avg('percent'))
    active = period_attempts.values('user').distinct().count()

    class_ids = list(profiles.values_list('journal_class_id', flat=True).distinct())
    assignments = Assignment.objects.filter(journal_class_id__in=class_ids, is_published=True)
    if since:
        assignments = assignments.filter(created_at__gte=since)
    expected = 0
    per_class = dict(profiles.values('journal_class').annotate(n=Count('id')).values_list('journal_class', 'n'))
    for a in assignments.values('journal_class'):
        expected += per_class.get(a['journal_class'], 0)
    done = (
        Attempt.objects.filter(assignment__in=assignments, submitted_at__isnull=False, user_id__in=student_ids)
        .values('assignment', 'user').distinct().count()
    )

    weeks_from = timezone.now() - timedelta(weeks=8)
    trend = (
        attempts.filter(submitted_at__gte=weeks_from)
        .annotate(week=TruncWeek('submitted_at'))
        .values('week')
        .annotate(n=Count('id'), avg=Avg('percent'))
        .order_by('week')
    )

    reports = LessonReport.objects.all()
    readiness = Attempt.objects.filter(kind=Attempt.Kind.READINESS, submitted_at__isnull=False)
    if not viewer.is_oversight:
        reports = reports.filter(teacher=viewer)
        readiness = readiness.filter(user=viewer)
    elif scope.get('teacher_id'):
        reports = reports.filter(teacher_id=scope['teacher_id'])
        readiness = readiness.filter(user_id=scope['teacher_id'])
    elif scope.get('school_id'):
        # a school's teachers: everyone with a class there
        teachers = scope_classes(viewer, school_id=scope['school_id']).values('teacher_id')
        reports = reports.filter(teacher_id__in=teachers)
        readiness = readiness.filter(user_id__in=teachers)
    if since:
        reports = reports.filter(date__gte=since.date())
        readiness = readiness.filter(submitted_at__gte=since)
    rep = reports.aggregate(n=Count('id'), avg=Avg('rating', filter=Q(rating__isnull=False)))
    rdy = readiness.aggregate(n=Count('id'), avg=Avg('percent'))

    return {
        'students': len(student_ids),
        'active_students': active,
        'attempts': agg['n'] or 0,
        'avg_percent': round(agg['avg'], 1) if agg['avg'] is not None else None,
        'homework_expected': expected,
        'homework_done': done,
        'completion_rate': round(100 * done / expected, 1) if expected else None,
        'assignments': assignments.count(),
        'reports': rep['n'] or 0,
        'avg_rating': round(rep['avg'], 2) if rep['avg'] is not None else None,
        'readiness_checks': rdy['n'] or 0,
        'readiness_avg': round(rdy['avg'], 1) if rdy['avg'] is not None else None,
        'trend': [
            {'week': r['week'].date().isoformat() if r['week'] else None, 'attempts': r['n'],
             'avg_percent': round(r['avg'] or 0, 1)}
            for r in trend
        ],
    }


def top_students(viewer, since, limit=20, **scope):
    profiles = list(scope_profiles(viewer, **scope).select_related('user', 'journal_class'))
    by_user = {p.user_id: p for p in profiles}
    attempts = Attempt.objects.filter(
        user_id__in=by_user.keys(), submitted_at__isnull=False, kind__in=[Attempt.Kind.HOMEWORK, Attempt.Kind.PRACTICE],
    )
    if since:
        attempts = attempts.filter(submitted_at__gte=since)
    stats = {
        r['user']: r
        for r in attempts.values('user').annotate(
            n=Count('id'), total=Sum('percent'),
            hw_done=Count('assignment', distinct=True, filter=Q(kind=Attempt.Kind.HOMEWORK)),
        )
    }
    global_avg = attempts.aggregate(a=Avg('percent'))['a'] or STUDENT_PRIOR_MEAN

    assigned = Assignment.objects.filter(is_published=True, journal_class_id__in={p.journal_class_id for p in profiles})
    if since:
        assigned = assigned.filter(created_at__gte=since)
    assigned_per_class = dict(assigned.values('journal_class').annotate(n=Count('id')).values_list('journal_class', 'n'))

    rows = []
    for uid, s in stats.items():
        p = by_user[uid]
        quality = bayes(s['total'], s['n'], global_avg, STUDENT_PRIOR_WEIGHT)
        expected = assigned_per_class.get(p.journal_class_id, 0)
        completion = min(1.0, s['hw_done'] / expected) if expected else None
        activity = min(100.0, s['n'] * 5)
        score = _weighted([(quality, 0.6), (completion * 100 if completion is not None else None, 0.25), (activity, 0.15)])
        rows.append({
            'user': uid,
            'name': p.user.name,
            'class_id': p.journal_class_id,
            'class_name': p.journal_class.name if p.journal_class else '',
            'teacher_id': p.journal_class.teacher_id if p.journal_class else None,
            'grade': p.grade,
            'attempts': s['n'],
            'avg_percent': round(s['total'] / s['n'], 1),
            'quality': round(quality, 1),
            'completion_rate': round(completion * 100, 1) if completion is not None else None,
            'activity': round(activity),
            'score': round(score, 1),
        })
    rows.sort(key=lambda r: (-r['score'], -r['attempts']))
    for i, r in enumerate(rows, start=1):
        r['rank'] = i
    return rows[:limit]


def top_teachers(viewer, since, limit=20):
    """"Eng yaxshi dars o'tgan" ranking — combines administration's ratings
    of lesson reports, the teacher's own readiness checks, and how their
    students actually perform and keep up with homework."""
    if not viewer.is_oversight:
        teachers = User.objects.filter(pk=viewer.pk)
    else:
        teachers = User.objects.filter(is_active=True).exclude(role__in=[User.Role.STUDENT, User.Role.KUZATUVCHI]).filter(
            Q(classes__isnull=False) | Q(lesson_reports__isnull=False)
        ).distinct()
    teachers = list(teachers)
    ids = [t.id for t in teachers]

    reports = LessonReport.objects.filter(teacher_id__in=ids)
    readiness = Attempt.objects.filter(user_id__in=ids, kind=Attempt.Kind.READINESS, submitted_at__isnull=False)
    hw = Attempt.objects.filter(
        assignment__teacher_id__in=ids, kind=Attempt.Kind.HOMEWORK, submitted_at__isnull=False,
    )
    assignments = Assignment.objects.filter(teacher_id__in=ids, is_published=True)
    if since:
        reports = reports.filter(date__gte=since.date())
        readiness = readiness.filter(submitted_at__gte=since)
        hw = hw.filter(submitted_at__gte=since)
        assignments = assignments.filter(created_at__gte=since)

    rep = {r['teacher']: r for r in reports.values('teacher').annotate(
        n=Count('id'), rated=Count('rating'), total=Sum('rating'))}
    rdy = {r['user']: r for r in readiness.values('user').annotate(n=Count('id'), avg=Avg('percent'))}
    perf = {r['assignment__teacher']: r for r in hw.values('assignment__teacher').annotate(n=Count('id'), avg=Avg('percent'))}

    class_sizes = dict(
        StudentProfile.objects.filter(user__approved=True, user__is_active=True)
        .values('journal_class').annotate(n=Count('id')).values_list('journal_class', 'n')
    )
    expected = defaultdict(int)
    for a in assignments.values('teacher', 'journal_class'):
        expected[a['teacher']] += class_sizes.get(a['journal_class'], 0)
    done = defaultdict(int)
    for r in hw.values('assignment__teacher', 'assignment', 'user').distinct():
        done[r['assignment__teacher']] += 1

    rows = []
    for t in teachers:
        r = rep.get(t.id, {})
        rating = bayes(r.get('total'), r.get('rated'), RATING_PRIOR_MEAN, RATING_PRIOR_WEIGHT) if r.get('rated') else None
        rating_norm = (rating - 1) / 4 * 100 if rating is not None else None
        readiness_avg = rdy.get(t.id, {}).get('avg')
        class_avg = perf.get(t.id, {}).get('avg')
        completion = min(1.0, done[t.id] / expected[t.id]) if expected[t.id] else None
        score = _weighted([
            (rating_norm, 0.35), (class_avg, 0.25), (readiness_avg, 0.2),
            (completion * 100 if completion is not None else None, 0.2),
        ])
        if rating is None and readiness_avg is None and class_avg is None and completion is None:
            continue
        rows.append({
            'user': t.id,
            'name': t.name,
            'reports': r.get('n', 0),
            'avg_rating': round(r['total'] / r['rated'], 2) if r.get('rated') else None,
            'rating_score': round(rating_norm, 1) if rating_norm is not None else None,
            'readiness_checks': rdy.get(t.id, {}).get('n', 0),
            'readiness_avg': round(readiness_avg, 1) if readiness_avg is not None else None,
            'class_avg_percent': round(class_avg, 1) if class_avg is not None else None,
            'completion_rate': round(completion * 100, 1) if completion is not None else None,
            'score': round(score, 1),
        })
    rows.sort(key=lambda r: -r['score'])
    for i, r in enumerate(rows, start=1):
        r['rank'] = i
    return rows[:limit]


def best_reports(viewer, since, limit=10):
    qs = LessonReport.objects.filter(status=LessonReport.Status.REVIEWED, rating__isnull=False).select_related(
        'teacher', 'journal_class', 'lesson', 'readiness_attempt')
    if not viewer.is_oversight:
        qs = qs.filter(teacher=viewer)
    if since:
        qs = qs.filter(date__gte=since.date())
    return list(qs.order_by('-rating', '-date')[:limit])


def class_compare(viewer, since, teacher_id=None, school_id=None):
    classes = list(scope_classes(viewer, teacher_id=teacher_id, school_id=school_id).select_related('teacher'))
    ids = [c.id for c in classes]
    attempts = Attempt.objects.filter(
        user__student_profile__journal_class_id__in=ids, submitted_at__isnull=False,
        kind__in=[Attempt.Kind.HOMEWORK, Attempt.Kind.PRACTICE],
    )
    if since:
        attempts = attempts.filter(submitted_at__gte=since)
    perf = {
        r['user__student_profile__journal_class']: r
        for r in attempts.values('user__student_profile__journal_class').annotate(
            n=Count('id'), avg=Avg('percent'), active=Count('user', distinct=True))
    }
    sizes = dict(
        StudentProfile.objects.filter(journal_class_id__in=ids, user__approved=True, user__is_active=True)
        .values('journal_class').annotate(n=Count('id')).values_list('journal_class', 'n')
    )
    rows = []
    for c in classes:
        p = perf.get(c.id, {})
        rows.append({
            'class_id': c.id, 'name': c.name, 'school': c.school, 'teacher': c.teacher.name,
            'students': sizes.get(c.id, 0), 'active_students': p.get('active', 0), 'attempts': p.get('n', 0),
            'avg_percent': round(p['avg'], 1) if p.get('avg') is not None else None,
        })
    rows.sort(key=lambda r: (r['avg_percent'] is None, -(r['avg_percent'] or 0)))
    return rows


def lesson_stats(viewer, since, grade=None):
    """Which lessons students find hardest/easiest — useful for deciding
    where a video or theory text needs work."""
    student_ids = scope_profiles(viewer, grade=grade).values_list('user_id', flat=True)
    attempts = Attempt.objects.filter(
        user_id__in=student_ids, submitted_at__isnull=False, lesson__isnull=False,
        kind__in=[Attempt.Kind.HOMEWORK, Attempt.Kind.PRACTICE],
    )
    if since:
        attempts = attempts.filter(submitted_at__gte=since)
    rows = attempts.values('lesson', 'lesson__title', 'lesson__grade').annotate(
        n=Count('id'), avg=Avg('percent'), students=Count('user', distinct=True)).order_by('avg')
    with_material = set(LessonMaterial.objects.filter(is_published=True).values_list('lesson_id', flat=True))
    return [
        {'lesson': r['lesson'], 'title': r['lesson__title'], 'grade': r['lesson__grade'], 'attempts': r['n'],
         'students': r['students'], 'avg_percent': round(r['avg'] or 0, 1), 'has_material': r['lesson'] in with_material}
        for r in rows
    ]


def question_stats(attempts) -> list[dict]:
    """Item analysis over a set of submitted attempts: share of students
    who got each question right, hardest first."""
    totals: dict[str, dict] = {}
    for a in attempts:
        for item in a.snapshot:
            key = f"q{item['qid']}" if item.get('qid') else item['text'][:200]
            row = totals.setdefault(key, {'text': item['text'], 'topic': item.get('topic'), 'kind': item.get('kind'), 'n': 0, 'ok': 0})
            row['n'] += 1
            if a.results.get(item['id'], {}).get('ok'):
                row['ok'] += 1
    out = [{**r, 'percent': round(100 * r['ok'] / r['n'], 1) if r['n'] else 0} for r in totals.values()]
    out.sort(key=lambda r: r['percent'])
    return out


def lessons_summary():
    return {
        'lessons': Lesson.objects.count(),
        'with_material': LessonMaterial.objects.filter(is_published=True).count(),
    }
