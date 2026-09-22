"""Read-only cross-app aggregation for the admin/teacher analytics dashboard
(replaces the old bare AdminPage with stat cards + charts). Everything here
is computed live from existing tables — nothing is persisted, no new models.

Two audiences share one endpoint: an admin (or boshliq/dev-superuser) gets
the full picture (users, lessons, engagement, org-wide journal), a teacher
gets only their own journal.JournalClass rows. The `journal` section is
scoped through _scope_class_ids() as the single choke point so every
downstream metric (mastery, attendance, student count) inherits the same
boundary — mirrors JournalClassViewSet.get_queryset()'s teacher-vs-admin
scoping in journal/views.py.
"""

from collections import defaultdict
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import Http404
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from announcements.models import Announcement
from common.permissions import IsApproved
from journal.models import Student
from journal.schools import BLANK_SCHOOL_KEY
from journal.scoping import scoped_class_ids
from lessons.models import Experiment, Lesson
from telegrambot.models import TranslationJob
from timetable.models import TimetableSlot
from webpush.keys import vapid_configured
from webpush.models import PushSubscription

from . import mastery


def _scope_class_ids(request):
    return scoped_class_ids(request.user, request.query_params.get('teacher'))


def _mastery_bands(class_ids, chorak):
    """Kept for /summary/'s exact historical output shape (a stale cached
    frontend bundle depends on these six keys). The real computation now
    lives in mastery.class_metrics(), shared with MasteryBreakdownView so
    the two surfaces can never disagree."""
    averages = [avg for _cid, _sid, avg in mastery.student_averages(class_ids, chorak)]
    total_students = sum(mastery.active_student_counts(class_ids).values())
    m = mastery.class_metrics(averages, total_students, lesson_days=0, absent=0, possible=0)
    return {k: m[k] for k in ('good', 'mid', 'bad', 'ungraded', 'class_avg', 'class_pct')}


def _attendance_rate_pct(class_ids, chorak):
    """Not a port — no equivalent computation exists anywhere in the
    frontend today. 'Kech' (late) counts as present, matching
    attendance.ts's isAbsent(). Approximation: assumes every currently
    -active student was enrolled for every ClassDay in scope, since roster
    membership (Student.active) is current-state only and isn't tracked
    historically per day.

    Sums each class's own (active_students x lesson_days) before
    dividing — never (scope's total students) x (scope's total days),
    which cross-multiplies students against days from classes they were
    never in. With N classes of similar size that inflated the rate by
    roughly a factor of N; a single-class scope (the only case the old
    test suite exercised) happened to compute the same either way, which
    is how this went unnoticed."""
    active = mastery.active_student_counts(class_ids)
    days = mastery.lesson_day_counts(class_ids, chorak)
    absent = mastery.absence_counts(class_ids, chorak)
    possible = sum(active.get(cid, 0) * days.get(cid, 0) for cid in class_ids)
    if possible == 0:
        return None
    absent_total = sum(absent.get(cid, 0) for cid in class_ids)
    return round((1 - absent_total / possible) * 100, 1)


def _journal_section(request, chorak):
    class_ids = _scope_class_ids(request)
    return {
        'total_classes': len(class_ids),
        'total_students': Student.objects.filter(journal_class_id__in=class_ids, active=True).count(),
        'mastery': _mastery_bands(class_ids, chorak),
        'attendance_rate_pct': _attendance_rate_pct(class_ids, chorak),
    }


def _signups_by_day(days):
    since = (timezone.now() - timedelta(days=days)).date()
    rows = (
        User.objects.filter(created_at__date__gte=since)
        .annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(count=Count('id'))
    )
    counts = {row['day']: row['count'] for row in rows}
    today = timezone.now().date()
    return [
        {'date': (since + timedelta(days=i)).isoformat(), 'count': counts.get(since + timedelta(days=i), 0)}
        for i in range((today - since).days + 1)
    ]


def _role_breakdown():
    rows = User.objects.values('role').annotate(count=Count('id')).order_by('role')
    return [{'role': r['role'], 'count': r['count']} for r in rows]


def _lessons_by_grade():
    """One row per grade band, in the platform's own order, including bands
    with no lessons yet. Grouping only what exists hid a band the moment it
    was empty (8-9 after the 7 / 8-9 split), which reads as if the band were
    missing rather than unfilled."""
    counts = {r['grade']: r['count'] for r in Lesson.objects.values('grade').annotate(count=Count('id'))}
    return [{'grade': g, 'count': counts.get(g, 0)} for g, _label in Lesson.Grade.choices]


def _lessons_by_chorak():
    counts = {r['chorak']: r['count'] for r in Lesson.objects.values('chorak').annotate(count=Count('id'))}
    return [{'chorak': c, 'count': counts.get(c, 0)} for c in (1, 2, 3, 4)]


def _lessons_section():
    lessons = Lesson.objects.all()
    has_document = (Q(file__isnull=False) & ~Q(file='')) | ~Q(file_url='')
    return {
        'total': lessons.count(),
        'by_grade': _lessons_by_grade(),
        'by_chorak': _lessons_by_chorak(),
        'experiments_total': Experiment.objects.count(),
        # A lesson counts as having a document when it carries an uploaded
        # file or an external link — the two ways LessonEditor attaches one.
        'with_document': lessons.filter(has_document).count(),
        # translated_at is stamped by the bot's translation worker, so this
        # is real translation coverage, not a guess from the title fields.
        'translated': lessons.filter(translated_at__isnull=False).count(),
    }


def _timetable_section(request):
    """Weekly teaching load, in lesson-hours, per weekday.

    A slot's `span` is how many consecutive hours it occupies, so the load is
    the sum of spans, not the number of rows. `band` slots are busy
    placeholders ("elsewhere"), not lessons, and are left out; so are blank
    rows. Scoped like the journal: a teacher sees their own week, an admin
    the whole organisation (or one teacher via ?teacher=)."""
    user = request.user
    slots = TimetableSlot.objects.filter(band=False).filter(
        Q(maktab__gt='') | Q(xona__gt='') | Q(sinf__gt='') | Q(time_from__isnull=False)
    )
    teacher_id = request.query_params.get('teacher')
    if user.is_admin:
        if teacher_id:
            slots = slots.filter(teacher_id=teacher_id)
    else:
        slots = slots.filter(teacher=user)

    hours = {r['day_index']: r['hours'] for r in slots.values('day_index').annotate(hours=Sum('span'))}
    by_day = [{'day_index': d, 'hours': hours.get(d, 0)} for d in range(5)]
    return {'total_hours': sum(row['hours'] for row in by_day), 'by_day': by_day}


class DashboardSummaryView(APIView):
    """GET /api/dashboard/summary/?chorak=u&teacher=&days=30

    `chorak`: '1'|'2'|'3'|'4'|'u' (default 'u' — umumiy/overall, matching
    the convention JournalPage.tsx already uses). `teacher`/`days` are
    admin-only; ignored for a teacher, whose scope is always themselves.
    """

    permission_classes = [IsApproved]

    def get(self, request):
        raw_chorak = request.query_params.get('chorak', 'u')
        chorak = int(raw_chorak) if raw_chorak in ('1', '2', '3', '4') else None

        payload = {
            'role': 'admin' if request.user.is_admin else 'teacher',
            'chorak': raw_chorak,
            'generated_at': timezone.now().isoformat(),
            'journal': _journal_section(request, chorak),
            'timetable': _timetable_section(request),
        }

        if request.user.is_admin:
            days = int(request.query_params.get('days', 30))
            payload['users'] = {
                'total': User.objects.count(),
                'pending_approval': User.objects.filter(approved=False)
                .exclude(role__in=[User.Role.ADMIN, User.Role.BOSHLIQ]).count(),
                'by_role': _role_breakdown(),
                'signups_by_day': _signups_by_day(days),
                'telegram_linked': User.objects.filter(telegram_linked=True).count(),
                'two_factor_enabled': User.objects.filter(totp_enabled=True).count(),
            }
            payload['lessons'] = _lessons_section()
            payload['engagement'] = {
                # Without VAPID keys nobody can subscribe, so "0 subscribers"
                # would be misleading — the UI needs to tell "not set up" apart.
                'push_configured': vapid_configured(),
                'push_subscribers': PushSubscription.objects.values('user').distinct().count(),
                'announcements_last_30d': Announcement.objects.filter(
                    at__gte=timezone.now() - timedelta(days=30)).count(),
                'translation_jobs_pending': TranslationJob.objects.filter(
                    status=TranslationJob.Status.PENDING).count(),
            }

        return Response(payload)


class MasteryBreakdownView(APIView):
    """GET /api/dashboard/mastery/?chorak=u&school=&class=&period=quarter&teacher=

    Same journal scoping as DashboardSummaryView (via _scope_class_ids): a
    teacher sees only their own classes/schools, an admin sees the whole
    organisation (or one teacher's via ?teacher=). `school` is a
    normalized school key (journal.schools.normalize_school) or the
    sentinel journal.schools.BLANK_SCHOOL_KEY for classes with no school
    filled in; omitting it means "no school filter" (org level). `class`
    is a JournalClass id and must be one of the caller's scoped classes,
    or this 404s rather than leaking a class outside their scope.

    Every helper in dashboard/mastery.py is called exactly once, against
    the full scoped class_ids, regardless of which level is requested —
    org, school and class rows are all Python-side re-groupings of the
    same per-(class, student) rows, so the query count never grows with
    the number of schools or classes (see test_query_count_is_flat).
    """

    permission_classes = [IsApproved]

    def get(self, request):
        raw_chorak = request.query_params.get('chorak', 'u')
        chorak = int(raw_chorak) if raw_chorak in ('1', '2', '3', '4') else None
        period = request.query_params.get('period')
        if period not in ('week', 'month', 'quarter'):
            period = 'quarter'

        class_ids = _scope_class_ids(request)
        cmap = mastery.class_map(class_ids)
        labels = mastery.school_labels(cmap)

        classes_by_school = defaultdict(list)
        for cid, info in cmap.items():
            classes_by_school[info['school_key']].append(cid)

        # ── Resolve the requested scope level ──────────────────────
        class_param = request.query_params.get('class')
        school_param = request.query_params.get('school')

        selected_class_id = None
        if class_param is not None:
            try:
                selected_class_id = int(class_param)
            except ValueError:
                selected_class_id = -1  # guaranteed not in cmap -> 404 below
            if selected_class_id not in cmap:
                raise Http404("Sinf topilmadi yoki ko'rish huquqi yo'q.")

        if selected_class_id is not None:
            selected_school_key = cmap[selected_class_id]['school_key']
        elif school_param is not None:
            selected_school_key = school_param
            if selected_school_key not in classes_by_school:
                raise Http404("Maktab topilmadi yoki ko'rish huquqi yo'q.")
        else:
            selected_school_key = None

        distinct_schools = list(classes_by_school.keys())

        # scope.level reflects only the caller's own filter choice — it
        # never auto-collapses. (What DOES collapse is breakdown_level,
        # below: a single-school org has nothing to compare schools
        # against, so the comparison falls back to classes.)
        if selected_class_id is not None:
            level = 'class'
            scope_ids = [selected_class_id]
        elif selected_school_key is not None:
            level = 'school'
            scope_ids = classes_by_school[selected_school_key]
        else:
            level = 'org'
            scope_ids = class_ids

        # ── One fetch each, reused for every level ──────────────────
        averages_rows = mastery.student_averages(class_ids, chorak)
        active_counts = mastery.active_student_counts(class_ids)
        day_counts = mastery.lesson_day_counts(class_ids, chorak)
        absent_counts = mastery.absence_counts(class_ids, chorak)

        by_class_averages = defaultdict(list)
        for cid, _student_id, avg in averages_rows:
            by_class_averages[cid].append(avg)

        def group_metrics(ids):
            averages = [a for cid in ids for a in by_class_averages.get(cid, [])]
            total_students = sum(active_counts.get(cid, 0) for cid in ids)
            lesson_days = sum(day_counts.get(cid, 0) for cid in ids)
            absent = sum(absent_counts.get(cid, 0) for cid in ids)
            possible = sum(active_counts.get(cid, 0) * day_counts.get(cid, 0) for cid in ids)
            return mastery.class_metrics(averages, total_students, lesson_days, absent, possible)

        totals = group_metrics(scope_ids)
        totals['total_classes'] = len(scope_ids)

        # ── Comparison siblings: schools at org level (when there is more
        # than one to compare), classes otherwise. A single-school org
        # has no school-vs-school comparison to draw, so it falls
        # straight through to comparing that school's own classes — the
        # "Maktab bittagina" edge case: never a lone, meaningless bar. ──
        if level == 'org' and len(distinct_schools) > 1:
            breakdown_level = 'school'
            rows = []
            for key in distinct_schools:
                ids = classes_by_school[key]
                label, variants = (None, []) if key == BLANK_SCHOOL_KEY else labels[key]
                rows.append({
                    'key': key, 'label': label,
                    'sublabel': f'{len(ids)} sinf',
                    'classes': len(ids),
                    'variants': variants if len(variants) > 1 else [],
                    'selected': False,
                    **group_metrics(ids),
                })
        else:
            breakdown_level = 'class'
            sibling_ids = class_ids if level == 'org' else classes_by_school.get(selected_school_key, [])
            rows = [
                {
                    'key': str(cid), 'label': cmap[cid]['name'],
                    'sublabel': cmap[cid]['teacher_name'],
                    'classes': 1,
                    'variants': [],
                    'selected': cid == selected_class_id,
                    **group_metrics([cid]),
                }
                for cid in sibling_ids
            ]

        # Non-thin rows first by class_pct desc, then thin rows, blank
        # school always last — a 1-student "100%" row must never top the
        # comparison chart, and a school with no name is a data-quality
        # signal, not a real leaderboard entry.
        rows.sort(key=lambda r: (r['key'] == BLANK_SCHOOL_KEY, r['thin'], -(r['class_pct'] or -1)))

        # ── Filter lists (for the Maktab / Sinf selectors) ───────────
        school_filters = [
            {
                'key': key,
                'label': None if key == BLANK_SCHOOL_KEY else labels[key][0],
                'classes': len(ids),
                'variants': [] if key == BLANK_SCHOOL_KEY or len(labels[key][1]) <= 1 else labels[key][1],
            }
            for key, ids in classes_by_school.items()
        ]
        class_filters = [
            {'id': cid, 'name': info['name'], 'school': info['school_key'], 'teacher': info['teacher_name']}
            for cid, info in cmap.items()
        ]

        # ── Trend ─────────────────────────────────────────────────
        # date_range_ids=class_ids for both calls: class_ids is always a
        # superset of scope_ids and parent_ids, so both series iterate
        # the identical week/month bucket sequence and land on matching
        # keys — otherwise a school's own history starting later than
        # the org's would silently misalign the two lines position-by-
        # position instead of matching key-by-key.
        trend_points = mastery.mastery_trend(
            scope_ids, chorak, period, totals['total_students'], date_range_ids=class_ids)
        reference_points = None
        if level != 'org':
            parent_ids = classes_by_school[selected_school_key] if level == 'class' else class_ids
            parent_total = sum(active_counts.get(cid, 0) for cid in parent_ids)
            reference_points = mastery.mastery_trend(
                parent_ids, chorak, period, parent_total, date_range_ids=class_ids)

        return Response({
            'chorak': raw_chorak,
            'period': period,
            'scope': {
                'level': level,
                'school': selected_school_key,
                'school_label': (
                    None if selected_school_key in (None, BLANK_SCHOOL_KEY)
                    else labels.get(selected_school_key, (None, []))[0]
                ),
                'class_id': selected_class_id,
                'class_name': cmap[selected_class_id]['name'] if selected_class_id is not None else None,
            },
            'filters': {'schools': school_filters, 'classes': class_filters},
            'totals': totals,
            'breakdown': {'level': breakdown_level, 'rows': rows},
            'trend': {
                'period': period,
                'points': trend_points,
                'reference': reference_points,
                # period='quarter' always shows all four choraks (see
                # mastery.mastery_trend's docstring) — the frontend shows
                # a caption when this is true so the chip and the chart
                # never silently disagree.
                'ignores_chorak_filter': period == 'quarter' and chorak is not None,
            },
        })
