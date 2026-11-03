"""Partner schools registry, linking tool, school statistics and the
shared directory (/api/schools/)."""

import hashlib
import json
from collections import defaultdict

from django.core.cache import cache
from django.db.models import Avg, Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.audit import notify_admin_action
from common.permissions import IsAdminOrDevSuperuser, IsApproved, IsOversight
from common.presence import presence_for
from common.security import log_event
from journal.models import AttendanceEntry, GradeEntry, JournalClass, Student

from . import stats
from .matching import link_school, norm, unlinked_names
from .models import AcademicYear, School, SchoolTeacher, SchoolYear
from .serializers import SchoolBriefSerializer, SchoolSerializer


def _chorak(request):
    raw = request.query_params.get('chorak')
    return int(raw) if raw in ('1', '2', '3', '4') else None


def _year(request):
    """?year=<id>: which o'quv yili the figures are for — the current one by default."""
    return AcademicYear.from_param(request.query_params.get('year'))


def _period(request):
    """Trend grouping: week / month (default) / quarter / year."""
    raw = request.query_params.get('period')
    return raw if raw in stats.PERIODS else 'month'


class SchoolViewSet(viewsets.ModelViewSet):
    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsAdminOrDevSuperuser()]

    def get_queryset(self):
        qs = School.objects.all()
        if self.request.user.is_oversight:
            qs = qs.annotate(
                teachers_count=Count('memberships', distinct=True),
                classes_count=Count('classes', distinct=True),
                students_count=Count('classes__students', filter=Q(classes__students__active=True), distinct=True),
            )
        else:
            qs = qs.filter(is_active=True)
        return qs

    def get_serializer_class(self):
        return SchoolSerializer if self.request.user.is_oversight else SchoolBriefSerializer

    def perform_create(self, serializer):
        school = serializer.save()  # its per-year rows: schools/signals.py
        result = link_school(school)
        notify_admin_action(self.request.user, f"Hamkor maktab qo'shdi: «{school.name}» ({result['classes']} ta sinf biriktirildi)")

    def perform_update(self, serializer):
        school = serializer.save()
        link_school(school)
        notify_admin_action(self.request.user, f"Hamkor maktabni tahrirladi: «{school.name}»")

    def perform_destroy(self, instance):
        notify_admin_action(self.request.user, f"Hamkor maktabni o'chirdi: «{instance.name}» (sinflar maktabsiz qoldi)")
        instance.delete()

    def retrieve(self, request, *args, **kwargs):
        school = self.get_object()
        data = self.get_serializer(school).data
        if request.user.is_oversight:
            # one o'quv yili's teachers: those with a class here that year,
            # and — for the current year — those assigned to the school
            year = _year(request)
            members = ({m.teacher_id: m for m in school.memberships.select_related('teacher')} if year.is_current else {})
            class_teachers = dict(school.classes.filter(year=year).values('teacher').annotate(n=Count('id')).values_list('teacher', 'n'))
            data['year'] = year.id
            data['years'] = self._years(school)
            teachers = list(User.objects.filter(Q(pk__in=members) | Q(pk__in=class_teachers)).order_by('name'))
            presence = presence_for(teachers)
            data['teachers'] = [
                {'id': t.id, 'name': t.name, 'phone': t.phone, 'email': t.email, 'assigned': t.id in members,
                 'classes': class_teachers.get(t.id, 0), 'since': members[t.id].since if t.id in members else None,
                 'online': presence[t.id]['online'], 'last_seen': presence[t.id]['last_seen']}
                for t in teachers
            ]
        return Response(data)

    @staticmethod
    def _years(school):
        active = dict(school.school_years.values_list('year_id', 'is_active'))
        classes = dict(school.classes.values('year').annotate(n=Count('id')).values_list('year', 'n'))
        return [{'id': y.id, 'name': y.name, 'is_current': y.is_current, 'is_active': active.get(y.id, False),
                 'classes': classes.get(y.id, 0)} for y in AcademicYear.objects.all()]

    @action(detail=True, methods=['post'], url_path='year-active')
    def year_active(self, request, pk=None):
        """POST {year, is_active}: a partner in that o'quv yili or not."""
        school = self.get_object()
        year = get_object_or_404(AcademicYear, pk=request.data.get('year'))
        active = bool(request.data.get('is_active'))
        SchoolYear.set(school, year, active)
        notify_admin_action(request.user, f"«{school.name}» — {year.name}: {'faol hamkor' if active else 'faol emas'}")
        return Response({'years': self._years(school)})

    @action(detail=True, methods=['post'], url_path='add-teacher')
    def add_teacher(self, request, pk=None):
        school = self.get_object()
        teacher = get_object_or_404(User.objects.exclude(role=User.Role.STUDENT), pk=request.data.get('teacher'))
        SchoolTeacher.objects.get_or_create(school=school, teacher=teacher, defaults={'since': request.data.get('since') or None})
        notify_admin_action(request.user, f"O'qituvchini maktabga biriktirdi: {teacher.name} → «{school.name}»")
        return Response({'ok': True})

    @action(detail=True, methods=['post'], url_path='remove-teacher')
    def remove_teacher(self, request, pk=None):
        school = self.get_object()
        deleted, _ = SchoolTeacher.objects.filter(school=school, teacher_id=request.data.get('teacher')).delete()
        if deleted:
            notify_admin_action(request.user, f"O'qituvchini maktabdan chiqardi: «{school.name}»")
        return Response({'ok': True})


class UnlinkedView(APIView):
    """Free-text school names in the journal/timetable that aren't
    attached to a partner school yet."""

    permission_classes = [IsOversight]

    def get(self, request):
        return Response(unlinked_names())


class LinkView(APIView):
    """Attach a free-text spelling to an existing school (stored as an
    alias) or to a newly created one, then link everything that matches."""

    permission_classes = [IsAdminOrDevSuperuser]

    def post(self, request):
        variants = [v for v in (request.data.get('variants') or [request.data.get('text')]) if str(v or '').strip()]
        if not variants:
            raise ValidationError({'text': "Nom ko'rsatilmagan."})
        if request.data.get('school'):
            school = get_object_or_404(School, pk=request.data['school'])
        else:
            name = ' '.join(str(request.data.get('new_name') or variants[0]).split())
            school = School.objects.filter(name__iexact=name).first() or School.objects.create(name=name)
        keys = {norm(school.name)} | {norm(a) for a in school.aliases or []}
        clash = School.objects.exclude(pk=school.pk)
        for v in variants:
            if norm(v) in keys:
                continue
            for other in clash:
                if norm(v) == norm(other.name) or norm(v) in {norm(a) for a in other.aliases or []}:
                    raise ValidationError({'detail': f"«{v}» allaqachon «{other.name}» maktabiga tegishli."})
            school.aliases = [*(school.aliases or []), v]
            keys.add(norm(v))
        school.save(update_fields=['aliases', 'updated_at'])
        result = link_school(school)
        notify_admin_action(request.user, f"Maktab nomlarini moslashtirdi: {', '.join(variants)} → «{school.name}»")
        return Response({'school': SchoolBriefSerializer(school).data, **result}, status=status.HTTP_200_OK)


def _cached(request, name, compute):
    from .signals import STATS_GENERATION_KEY

    generation = cache.get(STATS_GENERATION_KEY, 0)
    key = 'schools:' + hashlib.sha256(json.dumps(
        [name, generation, request.user.id, request.user.is_oversight, sorted(request.query_params.items())]).encode()).hexdigest()
    data = cache.get(key)
    if data is None:
        data = compute()
        cache.set(key, data, 60)
    return data


class StatsOverviewView(APIView):
    """Statistika's journal figures, one source for every tab: totals, the
    rows grouped by ?group=school (default) | teacher | class, the trend,
    the mark composition, the pupils per band and those needing attention
    (a low average or several unexcused absences) — optionally narrowed by
    the filter panel: ?school= (an id or 'none'), ?teacher=, ?class=."""

    permission_classes = [IsOversight]

    def get(self, request):
        chorak = _chorak(request)
        school_id = request.query_params.get('school') or None
        teacher_id = request.query_params.get('teacher') or None
        class_id = request.query_params.get('class') or None
        narrowed = bool(school_id or teacher_id or class_id)
        group = request.query_params.get('group')
        if group not in ('school', 'teacher', 'class'):
            group = 'school'

        def by_teacher(classes):
            rows = stats.grouped(classes, chorak, key=lambda c: c.teacher_id, label=lambda c: c.teacher.name)
            schools = defaultdict(set)
            for c in classes:
                schools[c.teacher_id].add(c.partner_school.name if c.partner_school_id else '')
            for row in rows:
                row['schools'] = sorted(name for name in schools[row['id']] if name)
                row['unlinked'] = '' in schools[row['id']]
            return sorted(rows, key=lambda r: r['name'].lower())

        def compute():
            year = _year(request)
            classes = stats.classes_for(request.user, school_id=school_id, teacher_id=teacher_id, year=year)
            if class_id:
                classes = [c for c in classes if str(c.id) == class_id]
            schools = stats.grouped(classes, chorak, key=lambda c: c.partner_school_id or 'none',
                                    label=lambda c: c.partner_school.name if c.partner_school_id else '')
            # a school's staff is its assigned teachers now; a past or coming
            # year has only the teachers of that year's classes
            members = (dict(SchoolTeacher.objects.values('school').annotate(n=Count('id')).values_list('school', 'n'))
                       if year.is_current else {})
            partners = School.objects.filter(school_years__year=year, school_years__is_active=True)
            for row in schools:
                if narrowed or row['id'] == 'none' or not year.is_current:
                    # the teachers of the classes in view, not the school's whole staff
                    row['teachers'] = len({c.teacher_id for c in classes if (c.partner_school_id or 'none') == row['id']})
                else:
                    row['teachers'] = members.get(row['id'], 0)
            if not narrowed:
                # Partner schools with no classes yet still belong in the list.
                listed = {r['id'] for r in schools}
                for s in partners.exclude(pk__in=[i for i in listed if i != 'none']):
                    schools.append({'id': s.id, 'name': s.name, 'classes': 0, 'teachers': members.get(s.id, 0),
                                    **stats.derive(dict.fromkeys(stats.RAW_KEYS, 0))})
            schools.sort(key=lambda r: (r['id'] == 'none', r['name'].lower()))
            rows = schools if group == 'school' else by_teacher(classes) if group == 'teacher' else stats.class_rows(classes, chorak)
            totals = stats.derive(stats.pool(stats.class_raw(classes, chorak).values()))
            totals.update({
                'schools': (len({c.partner_school_id for c in classes if c.partner_school_id}) if narrowed
                            else partners.count()),
                'teachers': len({c.teacher_id for c in classes}),
                'classes': len(classes),
            })
            payload = {'totals': totals, 'group': group, 'rows': rows,
                       'trend': stats.trend(classes, chorak, _period(request)),
                       'composition': stats.composition(classes, chorak),
                       'bands': stats.pupil_bands(classes, chorak),
                       'attention': stats.attention(classes, chorak, limit=100)}
            if group == 'school':
                payload['schools'] = rows  # what an older cached page reads
            return payload

        return Response(_cached(request, 'overview', compute))


class StatsSchoolView(APIView):
    """One school (or 'none' = classes not linked to any school)."""

    permission_classes = [IsOversight]

    def get(self, request, school_id):
        chorak = _chorak(request)
        school = None if school_id == 'none' else get_object_or_404(School, pk=school_id)

        def compute():
            classes = stats.classes_for(request.user, school_id='none' if school is None else school.id, year=_year(request))
            return {
                'school': SchoolBriefSerializer(school).data if school else None,
                'totals': stats.derive(stats.pool(stats.class_raw(classes, chorak).values())),
                'teachers': stats.grouped(classes, chorak, key=lambda c: c.teacher_id, label=lambda c: c.teacher.name),
                'classes': stats.class_rows(classes, chorak),
                'trend': stats.trend(classes, chorak, _period(request)),
                'composition': stats.composition(classes, chorak),
                'attention': stats.attention(classes, chorak, limit=50),
            }

        return Response(_cached(request, f'school-{school_id}', compute))


class StatsClassesView(APIView):
    """Per-class figures — teachers get their own classes, administration
    everything (optionally ?school= / ?teacher=). Replaces the journal's
    old client-side admin table that fetched every class grid one by one."""

    permission_classes = [IsApproved]

    def get(self, request):
        chorak = _chorak(request)
        classes = stats.classes_for(request.user, school_id=request.query_params.get('school') or None,
                                    teacher_id=request.query_params.get('teacher') or None, year=_year(request))
        return Response(_cached(request, 'classes', lambda: stats.class_rows(classes, chorak)))


class StatsAttentionView(APIView):
    permission_classes = [IsApproved]

    def get(self, request):
        chorak = _chorak(request)
        classes = stats.classes_for(request.user, school_id=request.query_params.get('school') or None, year=_year(request))
        return Response(_cached(request, 'attention', lambda: stats.attention(classes, chorak)))


class StatsMineView(APIView):
    """A teacher's own classes only (for anyone, administrators included,
    it's the classes they teach themselves): totals, per partner school,
    per class, monthly trend and pupils needing attention."""

    permission_classes = [IsApproved]

    def get(self, request):
        chorak = _chorak(request)

        def compute():
            classes = stats.classes_for(request.user, teacher_id=request.user.id, year=_year(request))
            return {
                'totals': stats.derive(stats.pool(stats.class_raw(classes, chorak).values())),
                'schools': stats.grouped(classes, chorak, key=lambda c: c.partner_school_id or 'none',
                                         label=lambda c: c.partner_school.name if c.partner_school_id else (c.school or '')),
                'classes': stats.class_rows(classes, chorak),
                'trend': stats.trend(classes, chorak, _period(request)),
                'composition': stats.composition(classes, chorak),
                'attention': stats.attention(classes, chorak, limit=50),
            }

        return Response(_cached(request, 'mine', compute))


class ClassTeacherView(APIView):
    """Hand a journal class (roster, marks, student accounts) over to
    another teacher — e.g. when a class changes teachers mid-year."""

    permission_classes = [IsAdminOrDevSuperuser]

    def post(self, request, class_id):
        journal_class = get_object_or_404(JournalClass.objects.select_related('teacher'), pk=class_id)
        teacher = get_object_or_404(User.objects.exclude(role=User.Role.STUDENT).filter(approved=True, is_active=True),
                                    pk=request.data.get('teacher'))
        if teacher.pk == journal_class.teacher_id:
            return Response({'ok': True})
        previous = journal_class.teacher
        journal_class.teacher = teacher
        journal_class.save(update_fields=['teacher'])
        notify_admin_action(request.user, f"Sinfni boshqa o'qituvchiga o'tkazdi: {journal_class.name} — "
                                          f"{previous.name} → {teacher.name}")
        return Response({'ok': True, 'teacher': teacher.id, 'teacher_name': teacher.name})


class DirectoryPagination(PageNumberPagination):
    page_size = 50
    max_page_size = 500
    page_size_query_param = 'page_size'


class DirectoryView(APIView):
    """Umumiy ma'lumotlar bazasi — every pupil on every roster, searchable,
    with school / teacher / class, platform login and journal figures."""

    permission_classes = [IsOversight]

    def get(self, request):
        p = request.query_params
        qs = Student.objects.filter(active=True).select_related(
            'journal_class', 'journal_class__teacher', 'journal_class__partner_school', 'account__user')
        if p.get('q'):
            qs = qs.filter(Q(full_name__icontains=p['q']) | Q(journal_class__name__icontains=p['q']))
        if p.get('school') == 'none':
            qs = qs.filter(journal_class__partner_school__isnull=True)
        elif p.get('school'):
            qs = qs.filter(journal_class__partner_school_id=p['school'])
        if p.get('teacher'):
            qs = qs.filter(journal_class__teacher_id=p['teacher'])
        if p.get('class'):
            qs = qs.filter(journal_class_id=p['class'])
        qs = qs.filter(journal_class__year=_year(request))
        qs = qs.order_by('journal_class__partner_school__name', 'journal_class__name', 'order', 'full_name')

        paginator = DirectoryPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ids = [s.id for s in page]
        marks = {r['student']: r for r in GradeEntry.objects.filter(student_id__in=ids).values('student')
                 .annotate(avg=Avg('level'), n=Count('id'))}
        att: dict = {}
        for r in AttendanceEntry.objects.filter(student_id__in=ids).values('student', 'status').annotate(n=Count('id')):
            att.setdefault(r['student'], {})[r['status']] = r['n']
        rows = []
        for s in page:
            c = s.journal_class
            account = getattr(s, 'account', None)
            m = marks.get(s.id)
            a = att.get(s.id, {})
            rows.append({
                'id': s.id, 'name': s.full_name, 'class_id': c.id, 'class_name': c.name,
                'teacher_id': c.teacher_id, 'teacher': c.teacher.name,
                'school_id': c.partner_school_id, 'school': c.partner_school.name if c.partner_school_id else c.school,
                'school_linked': bool(c.partner_school_id),
                'login': account.user.username if account else None,
                'avg_mark': round(m['avg'], 2) if m else None, 'marks': m['n'] if m else 0,
                'abs_s': a.get('s', 0), 'abs_n': a.get('n', 0) + a.get('x', 0), 'late': a.get('k', 0),
            })
        return paginator.get_paginated_response(rows)


def _year_row(year, counts):
    return {'id': year.id, 'name': year.name, 'start_year': year.start_year,
            'is_current': year.is_current, 'classes': counts.get(year.id, 0)}


class AcademicYearsView(APIView):
    """O'quv yillari — GET: every year, newest first, with its class count
    (anyone signed in: the year pickers); POST: the administration adds
    the year after the newest one."""

    def get_permissions(self):
        return [IsApproved()] if self.request.method in SAFE_METHODS else [IsAdminOrDevSuperuser()]

    def get(self, request):
        AcademicYear.current()  # a fresh database still gets its first year
        counts = dict(JournalClass.objects.values('year').annotate(n=Count('id')).values_list('year', 'n'))
        return Response([_year_row(y, counts) for y in AcademicYear.objects.all()])

    def post(self, request):
        newest = AcademicYear.objects.order_by('-start_year').first() or AcademicYear.current()
        year = AcademicYear.objects.create(start_year=newest.start_year + 1)
        SchoolYear.carry_over(AcademicYear.current(), year)  # the partners go on unless marked otherwise
        log_event('academic_year_added', actor=request.user, request=request, detail=year.name)
        return Response(_year_row(year, {}), status=status.HTTP_201_CREATED)


class AcademicYearView(APIView):
    """POST: make this year the current one (where new classes go and what
    every page shows first); DELETE: remove a year that has no classes."""

    permission_classes = [IsAdminOrDevSuperuser]

    def post(self, request, pk):
        from .signals import bump_stats_cache

        year = get_object_or_404(AcademicYear, pk=pk)
        year.make_current()
        bump_stats_cache()
        log_event('academic_year_current', actor=request.user, request=request, detail=year.name)
        counts = dict(JournalClass.objects.values('year').annotate(n=Count('id')).values_list('year', 'n'))
        return Response(_year_row(year, counts))

    def delete(self, request, pk):
        year = get_object_or_404(AcademicYear, pk=pk)
        if year.is_current or year.classes.exists():
            return Response({'detail': "Joriy yoki sinflari bor o'quv yilini o'chirib bo'lmaydi."}, status=status.HTTP_400_BAD_REQUEST)
        log_event('academic_year_deleted', actor=request.user, request=request, detail=year.name)
        year.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AcademicYearRolloverView(APIView):
    """Yangi o'quv yiliga o'tish (journal/rollover.py) from this year to the
    next — GET: the plan, class by class; POST {exclude, make_current}: the
    next year's classes, one grade up, with their pupils (the year itself
    is added first if it isn't there yet)."""

    permission_classes = [IsAdminOrDevSuperuser]

    def get(self, request, pk):
        from journal.rollover import plan

        source = get_object_or_404(AcademicYear, pk=pk)
        target = AcademicYear.objects.filter(start_year=source.start_year + 1).first()
        return Response({
            'source': source.name, 'target': f'{source.start_year + 1}-{source.start_year + 2}',
            'target_exists': target is not None, 'target_current': bool(target and target.is_current),
            'rows': plan(source, target),
        })

    def post(self, request, pk):
        from journal.rollover import roll_over

        from .signals import bump_stats_cache

        source = get_object_or_404(AcademicYear, pk=pk)
        target = AcademicYear.objects.filter(start_year=source.start_year + 1).first()
        if target is None:
            target = AcademicYear.objects.create(start_year=source.start_year + 1)
            SchoolYear.carry_over(source, target)
        done = roll_over(source, target, exclude=request.data.get('exclude') or [])
        if request.data.get('make_current'):
            target.make_current()
            bump_stats_cache()
        log_event('academic_year_rollover', actor=request.user, request=request,
                  detail=f"{source.name} → {target.name}: {done['classes']} ta sinf, {done['students']} ta o'quvchi"
                         + (f'; {target.name} joriy' if request.data.get('make_current') else ''))
        return Response({**done, 'target': target.name, 'target_id': target.id, 'current': target.is_current})
