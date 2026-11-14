"""Nishonlar: which badges there are, how far each person is, and awarding
new tiers. Everything is counted from what is already stored (reports,
attempts, journal days, certificates…) — nothing to fill in by hand.

Each badge has three tiers (bronza, kumush, oltin) at the counts in
`tiers`; a person holds the highest one they reached.
"""

from collections import defaultdict

from django.apps import apps
from django.db.models import Count, Q
from django.utils import timezone

from notifications.models import Kind as NotifyKind
from notifications.service import notify

from .models import BadgeBaseline, UserBadge

TIER_NAMES = {1: 'bronza', 2: 'kumush', 3: 'oltin'}

BADGES = [
    # ustozlar
    {'key': 'hisobot', 'who': 'teacher', 'icon': 'file', 'label': 'Dars hisobotlari', 'unit': 'ta hisobot', 'tiers': (1, 10, 30)},
    {'key': 'alo_dars', 'who': 'teacher', 'icon': 'star', 'label': "A'lo dars", 'unit': "ta 5 ballik dars", 'tiers': (1, 5, 15)},
    {'key': 'tayyor', 'who': 'teacher', 'icon': 'target', 'label': 'Darsga tayyor', 'unit': "ta darsga tayyorgarlikdan o'tgan", 'tiers': (3, 10, 25)},
    {'key': 'vazifa', 'who': 'teacher', 'icon': 'list', 'label': 'Vazifa beruvchi', 'unit': 'ta vazifa', 'tiers': (5, 20, 50)},
    {'key': 'jurnal', 'who': 'teacher', 'icon': 'clipboard', 'label': 'Jurnal yurituvchi', 'unit': 'ta dars kuni', 'tiers': (20, 100, 300)},
    {'key': 'malaka', 'who': 'teacher', 'icon': 'cap', 'label': 'Malaka egasi', 'unit': 'ta sertifikat', 'tiers': (1, 3, 5)},
    {'key': 'mehmon', 'who': 'teacher', 'icon': 'users', 'label': 'Mehmon ustoz', 'unit': "ta darsga mehmon bo'lgan", 'tiers': (1, 5, 15)},
    # o'quvchilar
    {'key': 'test', 'who': 'pupil', 'icon': 'check2', 'label': 'Test ishlovchi', 'unit': 'ta topshirilgan test', 'tiers': (1, 20, 100)},
    {'key': 'yuz_ball', 'who': 'pupil', 'icon': 'star', 'label': '100 ball', 'unit': 'marta 100%', 'tiers': (1, 10, 30)},
    {'key': 'uy_vazifa', 'who': 'pupil', 'icon': 'list', 'label': 'Uy vazifasi', 'unit': 'ta bajarilgan vazifa', 'tiers': (5, 20, 50)},
    {'key': 'darslar', 'who': 'pupil', 'icon': 'atom', 'label': "Darslarni o'zlashtirgan", 'unit': "ta o'zlashtirilgan dars", 'tiers': (5, 20, 50)},
    {'key': 'daraja', 'who': 'pupil', 'icon': 'target', 'label': 'Daraja', 'unit': '-daraja', 'tiers': (3, 6, 10)},
]
BY_KEY = {b['key']: b for b in BADGES}


def _model(label):
    try:
        return apps.get_model(label)
    except LookupError:
        return None


def _counts(qs, field) -> dict:
    return dict(qs.values(field).annotate(n=Count('id')).values_list(field, 'n'))


def _distinct_counts(qs, field, other) -> dict:
    out = defaultdict(int)
    # no ordering: a model's default order would join the DISTINCT and count repeats
    for uid, _ in qs.order_by().values_list(field, other).distinct():
        out[uid] += 1
    return out


def is_teacher(user) -> bool:
    return user.is_staff_member and not user.is_observer and not user.is_school_admin


def teacher_metrics(ids) -> dict[str, dict]:
    from journal.models import ClassDay
    from learning.models import Assignment, Attempt, LessonReport
    from learning.readiness import PASS_PERCENT

    ids = list(ids)
    reports = LessonReport.objects.filter(teacher_id__in=ids)
    out = {
        'hisobot': _counts(reports, 'teacher'),
        'alo_dars': _counts(reports.filter(rating=5), 'teacher'),
        'tayyor': _distinct_counts(Attempt.objects.filter(
            user_id__in=ids, kind=Attempt.Kind.READINESS, submitted_at__isnull=False, percent__gte=PASS_PERCENT,
            lesson__isnull=False), 'user', 'lesson'),
        'vazifa': _counts(Assignment.objects.filter(teacher_id__in=ids, is_published=True), 'teacher'),
        'jurnal': _counts(ClassDay.objects.filter(journal_class__teacher_id__in=ids), 'journal_class__teacher'),
        'malaka': {}, 'mehmon': {},
    }
    if (Certificate := _model('training.Certificate')) is not None:
        out['malaka'] = _counts(Certificate.objects.filter(user_id__in=ids), 'user')
    if (GuestRequest := _model('staffroom.GuestRequest')) is not None:
        out['mehmon'] = _counts(GuestRequest.objects.filter(guest_id__in=ids, status='otkazildi'), 'guest')
    return out


def pupil_metrics(users) -> dict[str, dict]:
    from learning.models import Attempt, LessonProgress
    from learning.services import student_xp

    ids = [u.id for u in users]
    work = Attempt.objects.filter(user_id__in=ids, submitted_at__isnull=False,
                                  kind__in=[Attempt.Kind.PRACTICE, Attempt.Kind.HOMEWORK])
    return {
        'test': _counts(work, 'user'),
        'yuz_ball': _counts(work.filter(percent__gte=100), 'user'),
        'uy_vazifa': _distinct_counts(work.filter(kind=Attempt.Kind.HOMEWORK), 'user', 'assignment'),
        'darslar': _counts(LessonProgress.objects.filter(user_id__in=ids, completed_at__isnull=False), 'user'),
        'daraja': {u.id: student_xp(u)['level'] for u in users},
    }


def tier_of(badge, value) -> int:
    return sum(1 for t in badge['tiers'] if value >= t)


def sync(users) -> int:
    """Counts everyone in `users`, stores tiers newly reached and tells
    them (except on their very first count). Returns how many were told."""
    users = [u for u in users if u.is_active]
    teachers = [u for u in users if u.is_student is False and is_teacher(u)]
    pupils = [u for u in users if u.is_student]
    metrics = {}
    if teachers:
        metrics.update(teacher_metrics([u.id for u in teachers]))
    if pupils:
        metrics.update(pupil_metrics(pupils))
    ids = [u.id for u in teachers + pupils]
    held = {(b.user_id, b.key): b for b in UserBadge.objects.filter(user_id__in=ids)}
    counted = set(BadgeBaseline.objects.filter(user_id__in=ids).values_list('user_id', flat=True))
    told = 0
    for who, group in (('teacher', teachers), ('pupil', pupils)):
        for u in group:
            for badge in (b for b in BADGES if b['who'] == who):
                tier = tier_of(badge, metrics.get(badge['key'], {}).get(u.id, 0))
                row = held.get((u.id, badge['key']))
                if tier == 0 or (row and row.tier >= tier):
                    continue
                if row:
                    row.tier = tier
                    row.save(update_fields=['tier', 'earned_at'])
                else:
                    UserBadge.objects.create(user=u, key=badge['key'], tier=tier)
                if u.id in counted:
                    notify(u, NotifyKind.RAGBAT, f"Yangi nishon: «{badge['label']}» — {TIER_NAMES[tier]}",
                           f"{badge['tiers'][tier - 1]} {badge['unit']}",
                           url='/s/profile' if who == 'pupil' else '/achievements?bolim=nishonlar')
                    told += 1
    BadgeBaseline.objects.bulk_create([BadgeBaseline(user_id=i) for i in ids if i not in counted], ignore_conflicts=True)
    return told


def sync_all() -> int:
    from accounts.models import User

    return sync(User.objects.filter(is_active=True).filter(
        Q(role=User.Role.STUDENT, approved=True) | ~Q(role__in=[User.Role.STUDENT, User.Role.KUZATUVCHI, User.Role.MAKTAB])))


def progress(user) -> list[dict]:
    """The person's badges: tier held, how far they are, what is next."""
    sync([user])
    who = 'pupil' if user.is_student else 'teacher'
    if who == 'teacher' and not is_teacher(user):
        return []
    metrics = pupil_metrics([user]) if who == 'pupil' else teacher_metrics([user.id])
    held = {b.key: b for b in UserBadge.objects.filter(user=user)}
    out = []
    for badge in (b for b in BADGES if b['who'] == who):
        value = metrics.get(badge['key'], {}).get(user.id, 0)
        row = held.get(badge['key'])
        tier = row.tier if row else 0
        nxt = badge['tiers'][tier] if tier < 3 else None
        out.append({
            'key': badge['key'], 'label': badge['label'], 'icon': badge['icon'], 'unit': badge['unit'],
            'tiers': list(badge['tiers']), 'tier': tier, 'tier_name': TIER_NAMES.get(tier, ''),
            'value': value, 'next': nxt, 'earned_at': row.earned_at if row else None,
        })
    return out


# ── Ustozlar reytingi: a month's activity ───────────────────────────────

POINTS = {'hisobot': 10, 'alo_dars': 5, 'tayyor': 5, 'vazifa': 3, 'jurnal': 1, 'malaka': 20, 'modul': 5, 'mehmon': 15}


def month_bounds(month: str | None):
    today = timezone.localdate()
    y, m = today.year, today.month
    if month:
        try:
            y, m = (int(x) for x in month.split('-'))
        except ValueError:
            pass
    start = timezone.make_aware(timezone.datetime(y, m, 1))
    end = timezone.make_aware(timezone.datetime(y + (m == 12), 1 if m == 12 else m + 1, 1))
    return start, end, f'{y}-{m:02d}'


def leaderboard(month: str | None) -> dict:
    """Points each teacher earned in the month — for doing things, not for
    how good anyone judged them (only an "a'lo" lesson adds a bonus)."""
    from accounts.models import User
    from journal.models import ClassDay
    from learning.models import Assignment, Attempt, LessonReport
    from learning.readiness import PASS_PERCENT

    start, end, label = month_bounds(month)
    teachers = list(User.objects.filter(is_active=True).exclude(
        role__in=[User.Role.STUDENT, User.Role.KUZATUVCHI, User.Role.MAKTAB]))
    ids = [t.id for t in teachers]
    in_month = {'created_at__gte': start, 'created_at__lt': end}
    parts = {
        'hisobot': _counts(LessonReport.objects.filter(teacher_id__in=ids, **in_month), 'teacher'),
        'alo_dars': _counts(LessonReport.objects.filter(teacher_id__in=ids, rating=5, reviewed_at__gte=start,
                                                        reviewed_at__lt=end), 'teacher'),
        'tayyor': _distinct_counts(Attempt.objects.filter(
            user_id__in=ids, kind=Attempt.Kind.READINESS, percent__gte=PASS_PERCENT, lesson__isnull=False,
            submitted_at__gte=start, submitted_at__lt=end), 'user', 'lesson'),
        'vazifa': _counts(Assignment.objects.filter(teacher_id__in=ids, is_published=True, **in_month), 'teacher'),
        'jurnal': _counts(ClassDay.objects.filter(journal_class__teacher_id__in=ids, date__gte=start.date(),
                                                  date__lt=end.date()), 'journal_class__teacher'),
        'malaka': {}, 'modul': {}, 'mehmon': {},
    }
    if (Certificate := _model('training.Certificate')) is not None:
        parts['malaka'] = _counts(Certificate.objects.filter(user_id__in=ids, issued_at__gte=start, issued_at__lt=end), 'user')
    if (TrainingAttempt := _model('training.TrainingAttempt')) is not None:
        parts['modul'] = _distinct_counts(TrainingAttempt.objects.filter(
            user_id__in=ids, submitted_at__gte=start, submitted_at__lt=end, percent__gte=70), 'user', 'module')
    if (GuestRequest := _model('staffroom.GuestRequest')) is not None:
        parts['mehmon'] = _counts(GuestRequest.objects.filter(guest_id__in=ids, status='otkazildi', handled_at__gte=start,
                                                              handled_at__lt=end), 'guest')
    rows = []
    for t in teachers:
        counts = {k: parts[k].get(t.id, 0) for k in POINTS}
        points = sum(POINTS[k] * n for k, n in counts.items())
        if points:
            rows.append({'user': t.id, 'name': t.name, 'photo': t.photo.url if t.photo else None,
                         'points': points, 'counts': counts})
    rows.sort(key=lambda r: (-r['points'], r['name']))
    for i, r in enumerate(rows, start=1):
        r['rank'] = i
    return {'month': label, 'rows': rows, 'points': POINTS}
