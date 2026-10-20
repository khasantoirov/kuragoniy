"""Partner schools registry, linking tool, school statistics and the
shared directory (/api/schools/)."""

import hashlib
import json

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
from journal.models import AttendanceEntry, GradeEntry, JournalClass, Student

from . import stats
from .matching import link_school, norm, unlinked_names
from .models import School, SchoolTeacher
from .serializers import SchoolBriefSerializer, SchoolSerializer


def _chorak(request):
    raw = request.query_params.get('chorak')
    return int(raw) if raw in ('1', '2', '3', '4') else None


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
        school = serializer.save()
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
            members = {m.teacher_id: m for m in school.memberships.select_related('teacher')}
            class_teachers = dict(school.classes.values('teacher').annotate(n=Count('id')).values_list('teacher', 'n'))
            teachers = list(User.objects.filter(Q(pk__in=members) | Q(pk__in=class_teachers)).order_by('name'))
            presence = presence_for(teachers)
            data['teachers'] = [
                {'id': t.id, 'name': t.name, 'phone': t.phone, 'email': t.email, 'assigned': t.id in members,
                 'classes': class_teachers.get(t.id, 0), 'since': members[t.id].since if t.id in members else None,
                 'online': presence[t.id]['online'], 'last_seen': presence[t.id]['last_seen']}
                for t in teachers
            ]
        return Response(data)

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
    """All partner schools side by side + totals + monthly trend."""

    permission_classes = [IsOversight]

    def get(self, request):
        chorak = _chorak(request)

        def compute():
            classes = stats.classes_for(request.user)
            schools = stats.grouped(classes, chorak, key=lambda c: c.partner_school_id or 'none',
                                    label=lambda c: c.partner_school.name if c.partner_school_id else '')
            members = dict(SchoolTeacher.objects.values('school').annotate(n=Count('id')).values_list('school', 'n'))
            for row in schools:
                row['teachers'] = members.get(row['id'], 0) if row['id'] != 'none' else len(
                    {c.teacher_id for c in classes if not c.partner_school_id})
            # Partner schools with no classes yet still belong in the list.
            listed = {r['id'] for r in schools}
            for s in School.objects.filter(is_active=True).exclude(pk__in=[i for i in listed if i != 'none']):
                schools.append({'id': s.id, 'name': s.name, 'classes': 0, 'teachers': members.get(s.id, 0),
                                **stats.derive(dict.fromkeys(stats.RAW_KEYS, 0))})
            schools.sort(key=lambda r: (r['id'] == 'none', r['name'].lower()))
            totals = stats.derive(stats.pool(stats.class_raw(classes, chorak).values()))
            totals.update({
                'schools': School.objects.filter(is_active=True).count(),
                'teachers': len({c.teacher_id for c in classes}),
                'classes': len(classes),
            })
            return {'totals': totals, 'schools': schools, 'trend': stats.trend(classes, chorak, _period(request)),
                'composition': stats.composition(classes, chorak)}

        return Response(_cached(request, 'overview', compute))


class StatsSchoolView(APIView):
    """One school (or 'none' = classes not linked to any school)."""

    permission_classes = [IsOversight]

    def get(self, request, school_id):
        chorak = _chorak(request)
        school = None if school_id == 'none' else get_object_or_404(School, pk=school_id)

        def compute():
            classes = stats.classes_for(request.user, school_id='none' if school is None else school.id)
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
                                    teacher_id=request.query_params.get('teacher') or None)
        return Response(_cached(request, 'classes', lambda: stats.class_rows(classes, chorak)))


class StatsAttentionView(APIView):
    permission_classes = [IsApproved]

    def get(self, request):
        chorak = _chorak(request)
        classes = stats.classes_for(request.user, school_id=request.query_params.get('school') or None)
        return Response(_cached(request, 'attention', lambda: stats.attention(classes, chorak)))


class StatsMineView(APIView):
    """A teacher's own classes only (for anyone, administrators included,
    it's the classes they teach themselves): totals, per partner school,
    per class, monthly trend and pupils needing attention."""

    permission_classes = [IsApproved]

    def get(self, request):
        chorak = _chorak(request)

        def compute():
            classes = stats.classes_for(request.user, teacher_id=request.user.id)
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
        qs = qs.order_by('journal_class__partner_school__name', 'journal_class__name', 'order', 'full_name')

        paginator = DirectoryPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        ids = [s.id for s in page]
        marks = {r['student']: r for r in GradeEntry.objects.filter(student_id__in=ids).values('student')
                 .annotate(avg=Avg('mark'), n=Count('id'))}
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
