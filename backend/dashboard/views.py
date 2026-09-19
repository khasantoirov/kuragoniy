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

from datetime import timedelta

from django.db.models import Avg, Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from announcements.models import Announcement
from common.permissions import IsApproved
from journal.models import AttendanceEntry, ClassDay, GradeEntry, JournalClass, Student
from lessons.models import Lesson
from telegrambot.models import TranslationJob
from webpush.models import PushSubscription

# masteryStats.ts's bandOfAvg thresholds — ported verbatim so the backend
# and the existing client-side per-class mastery chart agree on the same
# bands for the same data.
GOOD_THRESHOLD = 4.5
MID_THRESHOLD = 3.5


def _scope_class_ids(request):
    user = request.user
    teacher_id = request.query_params.get('teacher')
    if user.is_admin:
        qs = JournalClass.objects.filter(teacher_id=teacher_id) if teacher_id else JournalClass.objects.all()
    else:
        qs = JournalClass.objects.filter(teacher=user)
    return list(qs.values_list('id', flat=True))


def _mastery_bands(class_ids, chorak):
    entries = GradeEntry.objects.filter(day__journal_class_id__in=class_ids, student__active=True)
    if chorak:
        entries = entries.filter(day__chorak=chorak)
    per_student = entries.values('student_id').annotate(avg_mark=Avg('mark'))

    good = mid = bad = 0
    graded_ids = set()
    total = 0.0
    for row in per_student:
        graded_ids.add(row['student_id'])
        avg = row['avg_mark']
        total += avg
        if avg >= GOOD_THRESHOLD:
            good += 1
        elif avg >= MID_THRESHOLD:
            mid += 1
        else:
            bad += 1

    active_total = Student.objects.filter(journal_class_id__in=class_ids, active=True).count()
    ungraded = active_total - len(graded_ids)
    class_avg = round(total / len(graded_ids), 2) if graded_ids else None
    class_pct = round(class_avg / 5 * 100) if class_avg is not None else None
    return {'good': good, 'mid': mid, 'bad': bad, 'ungraded': ungraded, 'class_avg': class_avg, 'class_pct': class_pct}


def _attendance_rate_pct(class_ids, chorak):
    """Not a port — no equivalent computation exists anywhere in the
    frontend today. 'Kech' (late) counts as present, matching
    attendance.ts's isAbsent(). Approximation: assumes every currently
    -active student was enrolled for every ClassDay in scope, since roster
    membership (Student.active) is current-state only and isn't tracked
    historically per day."""
    days_qs = ClassDay.objects.filter(journal_class_id__in=class_ids)
    if chorak:
        days_qs = days_qs.filter(chorak=chorak)
    day_ids = list(days_qs.values_list('id', flat=True))
    active_students = Student.objects.filter(journal_class_id__in=class_ids, active=True).count()
    possible = active_students * len(day_ids)
    if possible == 0:
        return None
    absent = AttendanceEntry.objects.filter(
        day_id__in=day_ids,
        student__active=True,
        status__in=[AttendanceEntry.Status.SABABLI, AttendanceEntry.Status.SABABSIZ],
    ).count()
    return round((1 - absent / possible) * 100, 1)


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
    rows = Lesson.objects.values('grade').annotate(count=Count('id')).order_by('grade')
    return [{'grade': r['grade'], 'count': r['count']} for r in rows]


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
        }

        if request.user.is_admin:
            days = int(request.query_params.get('days', 30))
            payload['users'] = {
                'total': User.objects.count(),
                'pending_approval': User.objects.filter(approved=False)
                .exclude(role__in=[User.Role.ADMIN, User.Role.BOSHLIQ]).count(),
                'by_role': _role_breakdown(),
                'signups_by_day': _signups_by_day(days),
            }
            payload['lessons'] = {
                'total': Lesson.objects.count(),
                'by_grade': _lessons_by_grade(),
            }
            payload['engagement'] = {
                'push_subscribers': PushSubscription.objects.values('user').distinct().count(),
                'announcements_last_30d': Announcement.objects.filter(
                    at__gte=timezone.now() - timedelta(days=30)).count(),
                'translation_jobs_pending': TranslationJob.objects.filter(
                    status=TranslationJob.Status.PENDING).count(),
            }

        return Response(payload)
