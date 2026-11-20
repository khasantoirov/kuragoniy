"""Malaka oshirish (/api/training/).

Teachers: the course list, a course's modules (locked until the one before
is passed), "O'qidim" on lessons, module tests, their certificates.
Administration: courses and modules (questions with answers), assigning a
course to teachers or a whole school, everyone's progress. The school's
ma'muriyat sees their school's teachers. /verify/<code> is public.
"""

from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from accounts.models import User
from common.permissions import IsAdminOrDevSuperuser, IsApproved
from common.subjects import window
from common.security import log_event
from learning.grading import public_item, review_items

from . import services
from .models import Certificate, Course, CourseLesson, Enrollment, Module, TrainingAttempt
from .serializers import (
    CertificateSerializer, CourseSerializer, LessonSerializer, ModuleInputSerializer, module_editor_dict,
)


def _course_or_404(request, pk) -> Course:
    return get_object_or_404(services.visible_courses(request.user, window(request)), pk=pk)


def _learner(request):
    if not services.is_learner(request.user):
        raise PermissionDenied("Kurslarni o'qituvchilar o'qiydi.")


def _course_card(course, states, user, extra=None) -> dict:
    return {
        **CourseSerializer(course).data,
        **services.summary(states),
        'module_count': len(states),
        **(extra or {}),
    }


class CoursesView(APIView):
    permission_classes = [IsApproved]

    def get(self, request):
        user = request.user
        courses = list(services.visible_courses(user, window(request)))
        progress = services.progress_for(user, courses)
        enrollments = {e.course_id: e for e in Enrollment.objects.filter(user=user, course__in=courses)}
        certs = {c.course_id: c for c in Certificate.objects.filter(user=user, course__in=courses)}
        counts = {}
        if user.is_oversight:
            counts = {
                r['id']: r for r in Course.objects.filter(id__in=[c.id for c in courses]).annotate(
                    n_enrolled=Count('enrollments', distinct=True),
                    n_done=Count('certificates', distinct=True),
                ).values('id', 'n_enrolled', 'n_done')
            }
        today = timezone.localdate()
        out = []
        for c in courses:
            e, cert = enrollments.get(c.id), certs.get(c.id)
            out.append(_course_card(c, progress[c.id], user, {
                'enrolled': bool(e),
                'assigned': bool(e and e.assigned_by_id),
                'due_on': e.due_on if e else None,
                'overdue': bool(e and e.due_on and e.due_on < today and not cert),
                'certificate': {'id': cert.id, 'number': cert.number} if cert else None,
                'enrolled_count': counts.get(c.id, {}).get('n_enrolled'),
                'completed_count': counts.get(c.id, {}).get('n_done'),
            }))
        return Response(out)

    def post(self, request):
        if not services.can_edit(request.user):
            raise PermissionDenied('Bu amal faqat administrator uchun.')
        s = CourseSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        # made in a fan's window, it is that fan's course unless said otherwise
        fan = window(request)
        extra = {'subject': fan} if fan and not s.validated_data.get('subject') else {}
        course = s.save(created_by=request.user, **extra)
        log_event('training_course_added', actor=request.user, request=request, detail=course.title)
        return Response(CourseSerializer(course).data, status=status.HTTP_201_CREATED)


class CourseView(APIView):
    permission_classes = [IsApproved]

    def get(self, request, pk):
        user = request.user
        course = _course_or_404(request, pk)
        editor = services.can_edit(user) and request.query_params.get('edit') == '1'
        states = services.progress_for(user, [course])[course.id]
        enrollment = Enrollment.objects.filter(user=user, course=course).first()
        cert = Certificate.objects.filter(user=user, course=course).first()
        # admins and the read-only roles look through every module
        preview = user.is_oversight
        modules = []
        for st in states:
            m = st['module']
            if editor:
                modules.append(module_editor_dict(m))
                continue
            row = {
                'id': m.id, 'title': m.title, 'locked': st['locked'] and not preview, 'passed': st['passed'],
                'lessons_done': st['lessons_done'], 'has_test': st['has_test'],
                'question_count': (min(m.test_size, len(m.questions)) if m.test_size else len(m.questions)),
                'best_percent': st['best_percent'], 'attempts': st['attempts'], 'test_open': st['test_open'],
                'lessons': [],
            }
            for lesson in st['lessons']:
                item = {'id': lesson.id, 'title': lesson.title, 'done': lesson.id in st['read']}
                if not row['locked']:
                    item.update(body=lesson.body, video_url=lesson.video_url, links=lesson.links)
                row['lessons'].append(item)
            modules.append(row)
        return Response({
            **_course_card(course, states, user),
            'enrolled': bool(enrollment),
            'due_on': enrollment.due_on if enrollment else None,
            'certificate': CertificateSerializer(cert).data if cert else None,
            'can_learn': services.is_learner(user),
            'modules': modules,
        })

    def patch(self, request, pk):
        if not services.can_edit(request.user):
            raise PermissionDenied('Bu amal faqat administrator uchun.')
        course = get_object_or_404(Course, pk=pk)
        s = CourseSerializer(course, data=request.data, partial=True)
        s.is_valid(raise_exception=True)
        if s.validated_data.get('is_published'):
            modules = list(course.modules.annotate(n=Count('lessons')))
            if not modules:
                raise ValidationError({'detail': "Kursni e'lon qilishdan oldin kamida bitta modul qo'shing."})
            empty = next((m for m in modules if not m.n and not m.questions), None)
            if empty:
                raise ValidationError({'detail': f"«{empty.title}» modulida dars ham, test ham yo'q."})
        s.save()
        return Response(s.data)

    def delete(self, request, pk):
        if not services.can_edit(request.user):
            raise PermissionDenied('Bu amal faqat administrator uchun.')
        course = get_object_or_404(Course, pk=pk)
        log_event('training_course_deleted', actor=request.user, request=request,
                  detail=f'{course.title}: {course.enrollments.count()} ta o\'qituvchi')
        course.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EnrollView(APIView):
    permission_classes = [IsApproved]

    def post(self, request, pk):
        _learner(request)
        course = _course_or_404(request, pk)
        if not course.is_published:
            raise ValidationError({'detail': "Kurs hali e'lon qilinmagan."})
        services.ensure_enrollment(request.user, course)
        return Response({'ok': True})


def _save_module(module: Module, data: dict) -> Module:
    module.title = data['title']
    module.test_size = data.get('test_size') or 0
    if 'questions' in data:
        module.questions = data['questions']
    module.save()
    if 'lessons' in data:
        keep = []
        current = {lesson.id: lesson for lesson in module.lessons.all()}
        for i, row in enumerate(data['lessons']):
            lesson = current.get(row.get('id')) or CourseLesson(module=module)
            lesson.title = row['title']
            lesson.body = row.get('body', '')
            lesson.video_url = row.get('video_url', '')
            lesson.links = row.get('links', [])
            lesson.order = i
            lesson.save()
            keep.append(lesson.id)
        module.lessons.exclude(id__in=keep).delete()
    return module


class ModulesView(APIView):
    permission_classes = [IsAdminOrDevSuperuser]

    def post(self, request, pk):
        course = get_object_or_404(Course, pk=pk)
        s = ModuleInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            order = (course.modules.order_by('-order').values_list('order', flat=True).first() or 0) + 1
            module = _save_module(Module(course=course, order=order), s.validated_data)
        return Response(module_editor_dict(module), status=status.HTTP_201_CREATED)


class ModuleView(APIView):
    permission_classes = [IsAdminOrDevSuperuser]

    def put(self, request, pk):
        module = get_object_or_404(Module, pk=pk)
        s = ModuleInputSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        with transaction.atomic():
            _save_module(module, s.validated_data)
        return Response(module_editor_dict(module))

    def delete(self, request, pk):
        module = get_object_or_404(Module, pk=pk)
        course = module.course
        module.delete()
        if course.is_published and not course.modules.exists():
            course.is_published = False
            course.save(update_fields=['is_published'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModuleOrderView(APIView):
    """{modules: [ids in the new order]}"""

    permission_classes = [IsAdminOrDevSuperuser]

    def post(self, request, pk):
        course = get_object_or_404(Course, pk=pk)
        ids = request.data.get('modules')
        current = set(course.modules.values_list('id', flat=True))
        if not isinstance(ids, list) or set(ids) != current or len(ids) != len(current):
            raise ValidationError({'detail': "Modullar ro'yxati to'liq emas."})
        with transaction.atomic():
            for i, mid in enumerate(ids):
                Module.objects.filter(pk=mid).update(order=i + 1)
        return Response({'ok': True})


class LessonDoneView(APIView):
    permission_classes = [IsApproved]

    def post(self, request, pk):
        _learner(request)
        lesson = get_object_or_404(CourseLesson.objects.select_related('module__course'), pk=pk)
        _course_or_404(request, lesson.module.course_id)
        cert = services.mark_lesson(request.user, lesson)
        return Response({'ok': True, 'certificate': CertificateSerializer(cert).data if cert else None})


def _payload(attempt: TrainingAttempt) -> dict:
    return {
        'id': attempt.id, 'kind': 'training', 'started_at': attempt.started_at,
        'lesson': None, 'assignment': None, 'module': attempt.module_id,
        'questions': [public_item(i) for i in attempt.snapshot],
    }


class TestStartView(APIView):
    permission_classes = [IsApproved]

    def post(self, request, pk):
        _learner(request)
        module = get_object_or_404(Module.objects.select_related('course'), pk=pk)
        _course_or_404(request, module.course_id)
        attempt = services.start_test(request.user, module)
        return Response(_payload(attempt), status=status.HTTP_201_CREATED)


class TestSubmitView(APIView):
    permission_classes = [IsApproved]

    def post(self, request, pk):
        _learner(request)
        attempt = get_object_or_404(TrainingAttempt.objects.select_related('module__course'), pk=pk, user=request.user)
        passed, cert = services.submit_test(attempt, request.data.get('answers'))
        course = attempt.module.course
        return Response({
            'id': attempt.id, 'kind': 'training', 'percent': attempt.percent, 'score': attempt.score,
            'max_score': attempt.max_score, 'duration_sec': attempt.duration_sec,
            'submitted_at': attempt.submitted_at, 'passed': passed, 'pass_percent': course.pass_percent,
            # the right answers once the module is passed — before that only
            # right/wrong, so a retake still tests something
            'revealed': passed,
            'items': review_items(attempt, reveal=passed),
            'certificate': CertificateSerializer(cert).data if cert else None,
        })


def _teachers(ids) -> list[User]:
    return list(
        User.objects.filter(id__in=ids, is_active=True)
        .exclude(role__in=[User.Role.STUDENT, User.Role.KUZATUVCHI, User.Role.MAKTAB])
    )


class AssignView(APIView):
    """{teachers: [ids], school: id, due_on: "YYYY-MM-DD" | null} — a whole
    school's teachers, picked ones, or both."""

    permission_classes = [IsAdminOrDevSuperuser]

    def post(self, request, pk):
        from schools.models import SchoolTeacher

        course = get_object_or_404(Course, pk=pk)
        if not course.is_published:
            raise ValidationError({'detail': "Avval kursni e'lon qiling."})
        # user ids are strings (accounts.User.id)
        ids = {str(i) for i in (request.data.get('teachers') or []) if i}
        school = request.data.get('school')
        if school:
            ids |= set(SchoolTeacher.objects.filter(school_id=school).values_list('teacher_id', flat=True))
        users = _teachers(ids)
        if not users:
            raise ValidationError({'detail': "O'qituvchi tanlanmagan."})
        due = request.data.get('due_on') or None
        if due:
            from datetime import date
            try:
                due = date.fromisoformat(str(due))
            except ValueError:
                raise ValidationError({'due_on': "Sana noto'g'ri."})
        result = services.assign(course, users, request.user, due)
        log_event('training_assigned', actor=request.user, request=request,
                  detail=f'{course.title}: {len(users)} ta o\'qituvchi')
        return Response(result)


class UnassignView(APIView):
    permission_classes = [IsAdminOrDevSuperuser]

    def post(self, request, pk):
        course = get_object_or_404(Course, pk=pk)
        Enrollment.objects.filter(course=course, user_id=request.data.get('user')).delete()
        return Response({'ok': True})


class CourseProgressView(APIView):
    """Everyone on the course (enrolled, or holding its certificate)."""

    permission_classes = [IsApproved]

    def get(self, request, pk):
        if not request.user.is_oversight:
            raise PermissionDenied("Bu bo'lim ma'muriyat uchun.")
        course = get_object_or_404(Course, pk=pk)
        ids = set(course.enrollments.values_list('user_id', flat=True)) | set(
            course.certificates.values_list('user_id', flat=True))
        return Response(services.people_rows(course, User.objects.filter(id__in=ids)))


class SchoolTrainingView(APIView):
    """A school's teachers and their courses (school page)."""

    permission_classes = [IsApproved]

    def get(self, request, school_id):
        from schools.access import can_view_school
        from schools.models import SchoolTeacher

        if not can_view_school(request.user, int(school_id)):
            raise PermissionDenied("Bu maktab sizga biriktirilmagan.")
        teachers = _teachers(SchoolTeacher.objects.filter(school_id=school_id).values_list('teacher_id', flat=True))
        uids = [u.id for u in teachers]
        courses = list(Course.objects.filter(Q(enrollments__user__in=uids) | Q(certificates__user__in=uids)).distinct())
        by_user = {u.id: [] for u in teachers}
        for course in courses:
            for row in services.people_rows(course, teachers):
                if row['started_at'] or row['certificate']:
                    by_user[row['user']].append({
                        'course': course.id, 'title': course.title, 'percent': row['percent'],
                        'completed': row['completed'], 'due_on': row['due_on'], 'overdue': row['overdue'],
                        'certificate': row['certificate'],
                    })
        out = [{'id': u.id, 'name': u.name, 'courses': by_user[u.id]} for u in sorted(teachers, key=lambda u: u.name)]
        return Response({
            'teachers': out,
            'certified': sum(1 for t in out if any(c['completed'] for c in t['courses'])),
        })


class CertificatesView(APIView):
    permission_classes = [IsApproved]

    def get(self, request):
        qs = Certificate.objects.all()
        who = request.query_params.get('user')
        if request.user.is_oversight and who == 'all':
            pass
        elif request.user.is_oversight and who:
            qs = qs.filter(user_id=who)
        else:
            qs = qs.filter(user=request.user)
        return Response(CertificateSerializer(qs[:500], many=True).data)


class CertificateView(APIView):
    permission_classes = [IsApproved]

    def get(self, request, pk):
        cert = get_object_or_404(Certificate, pk=pk)
        if cert.user_id != request.user.id and not request.user.is_oversight:
            raise PermissionDenied('Bu sertifikat sizniki emas.')
        return Response(CertificateSerializer(cert).data)

    def delete(self, request, pk):
        if not services.can_edit(request.user):
            raise PermissionDenied('Bu amal faqat administrator uchun.')
        cert = get_object_or_404(Certificate, pk=pk)
        log_event('training_certificate_revoked', actor=request.user, request=request,
                  detail=f'№{cert.number} {cert.name} — {cert.course_title}')
        cert.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class VerifyThrottle(AnonRateThrottle):
    rate = '30/min'


class VerifyView(APIView):
    """Public: what the certificate says — nothing else about the person."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [VerifyThrottle]

    def get(self, request, code):
        cert = Certificate.objects.filter(code=str(code).strip().upper()[:16]).first()
        if not cert:
            return Response({'valid': False}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            'valid': True, 'name': cert.name, 'course_title': cert.course_title, 'hours': cert.hours,
            'number': cert.number, 'issued_at': cert.issued_at,
        })
