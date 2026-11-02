"""Read-only cross-app figures for Boshqaruv > Ma'lumot: the weekly
teaching load, and for an admin (or boshliq/dev-superuser) the accounts,
the lesson materials and the system. Everything is computed live from
existing tables — nothing is persisted. Pupils' marks and attendance are
Statistika's, computed in schools/stats.py.
"""

from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from announcements.models import Announcement
from common.permissions import IsApproved
from lessons.models import Experiment, Lesson
from telegrambot.models import TranslationJob
from timetable.models import TimetableSlot
from webpush.keys import vapid_configured
from webpush.models import PushSubscription



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
    """Staff by role — the chart is "Xodimlar rol bo'yicha", so pupils
    (a crowd of their own) stay out of it."""
    rows = User.objects.exclude(role=User.Role.STUDENT).values('role').annotate(count=Count('id')).order_by('role')
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
    """GET /api/dashboard/summary/?teacher=&days=30 — the school's working
    figures for Boshqaruv > Ma'lumot: weekly teaching load, and for an
    admin the accounts, lesson materials and system. `teacher`/`days` are
    admin-only; a teacher always sees their own week. (Pupils' marks and
    attendance are Statistika's, from schools/stats.py.)"""

    permission_classes = [IsApproved]

    def get(self, request):
        payload = {
            'role': 'admin' if request.user.is_admin else 'teacher',
            'generated_at': timezone.now().isoformat(),
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
