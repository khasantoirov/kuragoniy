"""GET /api/dashboard/monitoring/ — the administration's overview of the
whole platform: the Bosh sahifa monitoring for the administration and the
Statistika › Monitoring tab (owner's mock-ups, 2026-11-26).

Everything is counted live from existing tables, nothing is stored. Like the
rest of the platform it follows the fan window (common/subjects.window):
the Fizika window counts Fizika's classes, slots, courses and tickets, the
STEAM window STEAM's. Schools, licences and the Muhandis D teachers are the
organisation's and are the same in both. Readable by the oversight roles
(admin, boshliq, kuzatuvchi, the developer)."""

from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsOversight

# a licence ending within this many days is listed under "muddati tugayapti"
ENDING_LIST_DAYS = 30


def _window(request):
    from common.subjects import window

    return window(request)


def _kpi(fan, year, today):
    from accounts.models import User
    from journal.models import Student
    from schools import licensing
    from schools.models import School, SchoolTeacher
    from training.models import Certificate, Enrollment

    schools = list(School.objects.filter(is_active=True))
    in_force = sum(1 for s in schools if licensing.status(s, today)['in_force'])
    pupils = Student.objects.filter(active=True, journal_class__year=year)
    if fan:
        pupils = pupils.filter(journal_class__subject=fan)
    learning = Enrollment.objects.filter(completed_at__isnull=True, user__is_active=True)
    certs = Certificate.objects.all()
    if fan:
        learning = learning.filter(Q(course__subject=fan) | Q(course__subject=''))
        certs = certs.filter(Q(course__subject=fan) | Q(course__subject='') | Q(course__isnull=True))
    muhandis = SchoolTeacher.objects.filter(kind=SchoolTeacher.Kind.MUHANDIS, teacher__is_active=True)
    return {
        'schools': {'total': len(schools), 'in_force': in_force},
        'pupils': pupils.count(),
        'pupil_accounts': User.objects.filter(role=User.Role.STUDENT, is_active=True).count() if not fan
        else User.objects.filter(role=User.Role.STUDENT, is_active=True,
                                 student_profile__journal_class__subject=fan).count(),
        'training': {'learning': learning.values('user').distinct().count(), 'certificates': certs.count()},
        'muhandis': {'teachers': muhandis.values('teacher').distinct().count(),
                     'schools': muhandis.values('school').distinct().count()},
    }


def _today(fan, now):
    """Today's lessons from the weekly timetable, school by school: how many
    there are, how many have their journal day written, which is on now."""
    from journal.models import ClassDay
    from timetable.models import TimetableSlot

    today = timezone.localdate(now)
    weekday = today.weekday()
    out = {'date': today, 'weekday': weekday if weekday < 5 else None, 'schools': []}
    if weekday >= 5:
        return out
    slots = TimetableSlot.objects.filter(day_index=weekday, band=False).exclude(sinf='').select_related('school', 'teacher')
    if fan:
        slots = slots.filter(subject=fan)
    written = set(ClassDay.objects.filter(date=today).values_list('journal_class__teacher_id', 'journal_class__name'))
    clock = timezone.localtime(now).time()
    by_school = {}
    for s in slots:
        key = s.school_id or f'name:{s.maktab}'
        row = by_school.setdefault(key, {'id': s.school_id, 'name': s.school.name if s.school else (s.maktab or '—'),
                                         'lessons': 0, 'done': 0, 'now': False, 'next': None})
        row['lessons'] += 1
        if (s.teacher_id, s.sinf) in written:
            row['done'] += 1
        if s.time_from and s.time_to and s.time_from <= clock <= s.time_to:
            row['now'] = True
        elif s.time_from and s.time_from > clock and (row['next'] is None or s.time_from < row['next']):
            row['next'] = s.time_from
    rows = sorted(by_school.values(), key=lambda r: (not r['now'], r['name']))
    for r in rows:
        r['next'] = r['next'].strftime('%H:%M') if r['next'] else None
    out['schools'] = rows
    return out


def _licences(today):
    from schools import licensing
    from schools.models import School

    ending, by_state = [], {}
    for school in School.objects.filter(is_active=True):
        st = licensing.status(school, today)
        by_state[st['state']] = by_state.get(st['state'], 0) + 1
        lic = st['licence']
        if lic and st['state'] in ('ending', 'active', 'trial', 'unpaid') and st['days_left'] is not None \
                and st['days_left'] <= ENDING_LIST_DAYS:
            ending.append({'id': school.id, 'name': school.name, 'ends_on': lic['ends_on'], 'days_left': st['days_left'],
                           'state': st['state'], 'label': st['label'], 'plan': lic['plan_label']})
    ending.sort(key=lambda r: r['days_left'])
    return {'ending': ending[:8], 'by_state': by_state}


def _requests(fan):
    from accounts.models import User
    from helpdesk.models import Ticket
    from kits.models import KitRequest
    from staffroom.models import GuestRequest
    from website.models import Lead

    tickets = Ticket.objects.filter(status=Ticket.Status.OPEN)
    if fan:
        tickets = tickets.filter(fan=fan)
    return {
        'kits_new': KitRequest.objects.filter(status=KitRequest.Status.NEW).count() if fan != 'fizika' else 0,
        'guests_new': GuestRequest.objects.filter(status=GuestRequest.Status.NEW).count(),
        'leads_new': Lead.objects.filter(handled_at__isnull=True).count(),
        'tickets_open': tickets.count(),
        'staff_pending': User.objects.filter(approved=False, is_active=True)
        .exclude(role__in=[User.Role.ADMIN, User.Role.BOSHLIQ, User.Role.STUDENT]).count(),
    }


def _courses(fan):
    """Malaka oshirish: each published course's learners and how far they got."""
    from training.models import Course, CourseLesson, Enrollment, LessonDone

    courses = Course.objects.filter(is_published=True)
    if fan:
        courses = courses.filter(Q(subject=fan) | Q(subject=''))
    out = []
    for c in courses.order_by('order', 'id')[:6]:
        enrolled = list(Enrollment.objects.filter(course=c, user__is_active=True).values_list('user_id', 'completed_at'))
        if not enrolled:
            out.append({'id': c.id, 'title': c.title, 'enrolled': 0, 'completed': 0, 'progress': 0})
            continue
        total = CourseLesson.objects.filter(module__course=c).count()
        users = [u for u, _ in enrolled]
        done = LessonDone.objects.filter(lesson__module__course=c, user_id__in=users).count()
        completed = sum(1 for _, at in enrolled if at)
        # finished learners count as whole; the rest by the lessons they marked done
        progress = round(100 * min(1.0, done / (total * len(users)))) if total else round(100 * completed / len(users))
        out.append({'id': c.id, 'title': c.title, 'enrolled': len(users), 'completed': completed, 'progress': progress})
    return out


def _kits(fan):
    if fan == 'fizika':  # the kits belong to the STEAM window
        return None
    from kits.models import Kit, KitRequest, SchoolKit

    return {
        'types': Kit.objects.count(),
        'at_schools': SchoolKit.objects.aggregate(n=Sum('quantity'))['n'] or 0,
        'schools': SchoolKit.objects.values('school').distinct().count(),
        'open': KitRequest.objects.filter(status__in=[KitRequest.Status.NEW, KitRequest.Status.ACCEPTED]).count(),
        'delivered': KitRequest.objects.filter(status=KitRequest.Status.DELIVERED).count(),
    }


def _monthly(fan, year):
    """O'zlashtirish (marks of 3 and up) and sifat (4 and 5) per month of
    the school year, in %, from every journal mark of the window."""
    from journal.models import GradeEntry

    marks = GradeEntry.objects.filter(day__journal_class__year=year)
    if fan:
        marks = marks.filter(day__journal_class__subject=fan)
    rows = (marks.annotate(m=TruncMonth('day__date')).values('m')
            .annotate(n=Count('id'), passed=Count('id', filter=Q(level__gte=3)), good=Count('id', filter=Q(level__gte=4)))
            .order_by('m'))
    return [{'month': r['m'].strftime('%Y-%m'), 'marks': r['n'],
             'passed': round(100 * r['passed'] / r['n'], 1), 'quality': round(100 * r['good'] / r['n'], 1)}
            for r in rows if r['n']]


def _schools_table(fan, year, today):
    from journal.models import ClassDay, Student
    from schools import licensing
    from schools.models import School, SchoolTeacher

    since = today - timedelta(days=30)
    pupils = Student.objects.filter(active=True, journal_class__year=year, journal_class__partner_school__isnull=False)
    days = ClassDay.objects.filter(date__gte=since, journal_class__partner_school__isnull=False)
    if fan:
        pupils = pupils.filter(journal_class__subject=fan)
        days = days.filter(journal_class__subject=fan)
    pupil_n = dict(pupils.values_list('journal_class__partner_school').annotate(n=Count('id')))
    day_n = dict(days.values_list('journal_class__partner_school').annotate(n=Count('id')))
    teachers = {}
    for school_id, kind in SchoolTeacher.objects.filter(teacher__is_active=True).values_list('school_id', 'kind'):
        t = teachers.setdefault(school_id, {'all': 0, 'muhandis': 0})
        t['all'] += 1
        t['muhandis'] += kind == SchoolTeacher.Kind.MUHANDIS
    rows = []
    for school in School.objects.filter(is_active=True):
        st = licensing.status(school, today)
        lic = st['licence']
        t = teachers.get(school.id, {'all': 0, 'muhandis': 0})
        rows.append({
            'id': school.id, 'name': school.name, 'district': school.district,
            'pupils': pupil_n.get(school.id, 0), 'teachers': t['all'], 'muhandis': t['muhandis'],
            'lessons_30d': day_n.get(school.id, 0),
            'licence': {'state': st['state'], 'label': st['label'], 'in_force': st['in_force'],
                        'plan': lic['plan_label'] if lic else None, 'ends_on': lic['ends_on'] if lic else None,
                        'days_left': st['days_left']},
        })
    rows.sort(key=lambda r: (-r['lessons_30d'], -r['pupils'], r['name']))
    return rows


class MonitoringView(APIView):
    permission_classes = [IsOversight]

    def get(self, request):
        from schools.models import AcademicYear

        now = timezone.now()
        today = timezone.localdate(now)
        fan = _window(request)
        year = AcademicYear.current()
        return Response({
            'fan': fan,
            'generated_at': now.isoformat(),
            'year': str(year) if year else None,
            'kpi': _kpi(fan, year, today),
            'today': _today(fan, now),
            'licences': _licences(today),
            'requests': _requests(fan),
            'courses': _courses(fan),
            'kits': _kits(fan),
            'monthly': _monthly(fan, year),
            'schools': _schools_table(fan, year, today),
        })
