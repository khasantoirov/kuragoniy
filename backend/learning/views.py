"""Teacher + administration side of the learning workflow (/api/learning/).
The student portal lives in student_views.py (/api/student/)."""

import hashlib
import json

from django.core.cache import cache
from django.db import transaction
from django.db.models import Count, Max, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.audit import notify_admin_action, notify_user
from common.permissions import IsAdminOrDevSuperuser, IsApproved, IsOversight, IsTeacher
from common.security import generate_readable_password, log_event, revoke_all_tokens
from journal.models import JournalClass, Student
from lessons.models import Lesson

from . import analytics
from .grading import review_items
from .models import Assignment, Attempt, Award, ClassInvite, LessonMaterial, LessonReport, Question, StudentProfile
from .readiness import PASS_PERCENT, build_readiness_snapshot
from .serializers import (
    AssignmentSerializer,
    AttemptSummarySerializer,
    AwardSerializer,
    LessonMaterialSerializer,
    LessonReportSerializer,
    QuestionSerializer,
    ReportReviewSerializer,
    TeacherClassSerializer,
)
from .services import (
    assignment_progress_counts,
    attempt_payload,
    can_manage_student,
    can_view_student,
    class_student_counts,
    student_profile_or_404,
    student_xp,
    submit_attempt,
    visible_students,
)
from .student_accounts import create_student_account, new_join_code


def _int_param(request, name):
    raw = request.query_params.get(name)
    try:
        return int(raw) if raw not in (None, '') else None
    except ValueError:
        return None


# ── Classes, join codes, student accounts ─────────────────────────────

class TeacherClassViewSet(viewsets.ReadOnlyModelViewSet):
    """A teacher's journal classes, seen from the student-accounts angle:
    join code, roster vs. accounts, pending self-registrations."""

    serializer_class = TeacherClassSerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        user = self.request.user
        qs = JournalClass.objects.select_related('teacher', 'invite').annotate(
            roster_count=Count('students', filter=Q(students__active=True), distinct=True),
            account_count=Count('student_profiles', filter=Q(student_profiles__user__approved=True), distinct=True),
            pending_count=Count('student_profiles', filter=Q(student_profiles__user__approved=False), distinct=True),
        )
        teacher_id = self.request.query_params.get('teacher')
        if user.is_oversight:
            return qs.filter(teacher_id=teacher_id) if teacher_id else qs
        return qs.filter(teacher=user)

    def _own_class(self, request):
        jc = self.get_object()
        if jc.teacher_id != request.user.id and not request.user.is_admin:
            raise PermissionDenied("Bu sinf sizniki emas.")
        if request.user.is_observer:
            raise PermissionDenied("Kuzatuvchi faqat ko'ra oladi.")
        return jc

    @action(detail=True, methods=['post'])
    def invite(self, request, pk=None):
        """Create/regenerate the join code or toggle it: {regenerate?, is_active?, auto_approve?}."""
        jc = self._own_class(request)
        inv, created = ClassInvite.objects.get_or_create(journal_class=jc, defaults={'code': new_join_code()})
        if not created and request.data.get('regenerate'):
            inv.code = new_join_code()
        if 'is_active' in request.data:
            inv.is_active = bool(request.data.get('is_active'))
        if 'auto_approve' in request.data:
            inv.auto_approve = bool(request.data.get('auto_approve'))
        inv.save()
        return Response({'invite_code': inv.code, 'invite_active': inv.is_active, 'auto_approve': inv.auto_approve})

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        jc = self.get_object()
        profiles = (
            StudentProfile.objects.filter(journal_class=jc)
            .select_related('user', 'roster_entry')
            .order_by('user__approved', 'user__name')
        )
        roster = list(jc.students.filter(active=True).order_by('order'))
        linked = {p.roster_entry_id for p in profiles if p.roster_entry_id}
        attempts = (
            Attempt.objects.filter(user__student_profile__journal_class=jc, submitted_at__isnull=False)
            .values('user').annotate(n=Count('id'))
        )
        counts = {r['user']: r['n'] for r in attempts}
        return Response({
            'class': TeacherClassSerializer(self.get_queryset().get(pk=jc.pk)).data,
            'accounts': [
                {
                    'id': p.user_id, 'name': p.user.name, 'username': p.user.username, 'approved': p.user.approved,
                    'is_active': p.user.is_active, 'must_change_password': p.user.must_change_password,
                    'telegram_linked': p.user.telegram_linked, 'last_login': p.user.last_login,
                    'locked': bool(p.user.locked_until and p.user.locked_until > timezone.now()),
                    'roster_id': p.roster_entry_id, 'attempts': counts.get(p.user_id, 0),
                }
                for p in profiles
            ],
            'roster_without_account': [{'id': s.id, 'full_name': s.full_name} for s in roster if s.id not in linked],
        })

    @action(detail=True, methods=['post'], url_path='create-accounts')
    def create_accounts(self, request, pk=None):
        """Bulk-creates logins for roster rows that don't have one yet
        (all of them, or just `roster_ids`). The generated passwords are
        returned exactly once, for printing — they're not stored."""
        jc = self._own_class(request)
        ids = request.data.get('roster_ids')
        roster = jc.students.filter(active=True, account__isnull=True)
        if isinstance(ids, list):
            roster = roster.filter(id__in=[i for i in ids if isinstance(i, int)])
        roster = list(roster.order_by('order')[:200])
        created = []
        with transaction.atomic():
            for s in roster:
                user, plain = create_student_account(
                    full_name=s.full_name, journal_class=jc, roster_entry=s, created_by=request.user,
                )
                created.append({'id': user.id, 'name': user.name, 'username': user.username, 'password': plain})
        if created:
            log_event('students_created', actor=request.user, request=request, detail=f'{jc.name}: {len(created)} ta')
        return Response({'created': created}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='add-student')
    def add_student(self, request, pk=None):
        """New pupil not yet on the roster: adds the roster row and the
        account in one go."""
        jc = self._own_class(request)
        full_name = str(request.data.get('full_name') or '').strip()
        if not 3 <= len(full_name) <= 150:
            raise ValidationError({'full_name': "Ism-familiyani to'liq kiriting."})
        with transaction.atomic():
            order = (jc.students.order_by('-order').values_list('order', flat=True).first() or 0) + 1
            roster = Student.objects.create(journal_class=jc, full_name=full_name, order=order)
            user, plain = create_student_account(
                full_name=full_name, journal_class=jc, roster_entry=roster, created_by=request.user,
            )
        log_event('students_created', actor=request.user, request=request, detail=f'{jc.name}: {user.username}')
        return Response({'created': [{'id': user.id, 'name': user.name, 'username': user.username, 'password': plain}]},
                        status=status.HTTP_201_CREATED)


class StudentManageViewSet(viewsets.GenericViewSet):
    """Per-student actions for the class teacher (or an admin): approve a
    self-registration, reset a forgotten password, block, move, review."""

    permission_classes = [IsApproved]
    lookup_value_regex = '[A-Za-z0-9]{8,40}'

    def _profile(self, request, pk, manage=True):
        profile = student_profile_or_404(pk)
        allowed = can_manage_student(request.user, profile) if manage else can_view_student(request.user, profile)
        if not allowed:
            raise PermissionDenied("Bu o'quvchi sizning sinfingizda emas.")
        return profile

    def retrieve(self, request, pk=None):
        profile = self._profile(request, pk, manage=False)
        attempts = Attempt.objects.filter(user=profile.user, submitted_at__isnull=False).select_related(
            'lesson', 'assignment').order_by('-submitted_at')[:100]
        u = profile.user
        return Response({
            'id': u.id, 'name': u.name, 'username': u.username, 'approved': u.approved, 'is_active': u.is_active,
            'class_id': profile.journal_class_id, 'class_name': profile.journal_class.name if profile.journal_class else '',
            'grade': profile.grade, 'last_login': u.last_login, 'telegram_linked': u.telegram_linked,
            'xp': student_xp(u),
            'attempts': AttemptSummarySerializer(attempts, many=True).data,
            'awards': AwardSerializer(u.awards.all()[:20], many=True).data,
        })

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        profile = self._profile(request, pk)
        profile.user.approved = True
        profile.user.save(update_fields=['approved'])
        log_event('student_approved', actor=request.user, request=request, detail=profile.user.username or '')
        notify_user(profile.user, "✅ Amaliy Fizika: o'qituvchingiz hisobingizni tasdiqladi. Endi kirishingiz mumkin.")
        return Response({'ok': True})

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        profile = self._profile(request, pk)
        if profile.user.approved:
            raise ValidationError({'detail': "Tasdiqlangan hisobni o'chirib bo'lmaydi — bloklang."})
        label = profile.user.username
        profile.user.delete()
        log_event('student_rejected', actor=request.user, request=request, detail=label or '')
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """The class teacher resets a student's password — students without
        Telegram never need the developer for this."""
        profile = self._profile(request, pk)
        user = profile.user
        plain = generate_readable_password()
        user.set_password(plain)
        user.must_change_password = True
        user.failed_login_count = 0
        user.locked_until = None
        user.save(update_fields=['password', 'must_change_password', 'failed_login_count', 'locked_until'])
        revoke_all_tokens(user)
        log_event('student_password_reset', actor=request.user, request=request, detail=user.username or '')
        return Response({'username': user.username, 'password': plain})

    @action(detail=True, methods=['post'], url_path='set-active')
    def set_active(self, request, pk=None):
        profile = self._profile(request, pk)
        user = profile.user
        user.is_active = bool(request.data.get('is_active'))
        user.save(update_fields=['is_active'])
        if not user.is_active:
            revoke_all_tokens(user)
        log_event('student_active_changed', actor=request.user, request=request,
                  detail=f'{user.username}: {"faol" if user.is_active else "bloklandi"}')
        return Response({'is_active': user.is_active})

    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        profile = self._profile(request, pk)
        target = JournalClass.objects.filter(pk=request.data.get('class_id')).first()
        if not target or (target.teacher_id != request.user.id and not request.user.is_admin):
            raise ValidationError({'class_id': "Sinf topilmadi."})
        from .student_accounts import grade_from_class_name

        profile.journal_class = target
        profile.roster_entry = None
        profile.grade = grade_from_class_name(target.name) or profile.grade
        profile.save(update_fields=['journal_class', 'roster_entry', 'grade'])
        log_event('student_moved', actor=request.user, request=request, detail=f'{profile.user.username} → {target.name}')
        return Response({'ok': True})


# ── Content: student-facing material + question bank (admin authored) ─

class LessonMaterialView(APIView):
    """GET for any staff member; PUT for admins (shared curriculum)."""

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsAdminOrDevSuperuser()]

    def get(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        material = LessonMaterial.objects.filter(lesson=lesson).first()
        data = LessonMaterialSerializer(material).data if material else {
            'lesson': lesson.id, 'lesson_title': lesson.title, 'grade': lesson.grade, 'theory': '', 'formulas': [],
            'video_url': '', 'extra_videos': [], 'is_published': False, 'updated_at': None,
        }
        counts = Question.objects.filter(lesson=lesson, assignment__isnull=True).values('audience').annotate(n=Count('id'))
        data['question_counts'] = {r['audience']: r['n'] for r in counts}
        return Response(data)

    def put(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        material = LessonMaterial.objects.filter(lesson=lesson).first()
        serializer = LessonMaterialSerializer(material, data=request.data, partial=material is not None)
        serializer.is_valid(raise_exception=True)
        material = serializer.save(lesson=lesson, updated_by=request.user)
        notify_admin_action(request.user, f"O'quvchi materialini yangiladi: «{lesson.title}» ({lesson.grade}-sinf)")
        return Response(LessonMaterialSerializer(material).data)


class QuestionViewSet(viewsets.ModelViewSet):
    """Lesson question bank. Read: any staff member (answers included —
    staff only, never exposed to the student API). Write: admins."""

    serializer_class = QuestionSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsAdminOrDevSuperuser()]

    def get_queryset(self):
        qs = Question.objects.filter(assignment__isnull=True)
        lesson = self.request.query_params.get('lesson')
        audience = self.request.query_params.get('audience')
        if lesson:
            qs = qs.filter(lesson_id=lesson)
        if audience:
            qs = qs.filter(audience=audience)
        return qs

    def perform_create(self, serializer):
        if not serializer.validated_data.get('lesson'):
            raise ValidationError({'lesson': 'Dars tanlanmagan.'})
        serializer.save(created_by=self.request.user, assignment=None)

    def perform_update(self, serializer):
        serializer.save(assignment=None)


# ── Assignments ("darsni topshirish") ─────────────────────────────────

class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = AssignmentSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsTeacher()]

    def get_queryset(self):
        user = self.request.user
        qs = Assignment.objects.select_related('journal_class', 'lesson', 'teacher').prefetch_related('custom_questions')
        class_id = self.request.query_params.get('class')
        if class_id:
            qs = qs.filter(journal_class_id=class_id)
        if user.is_oversight:
            teacher_id = self.request.query_params.get('teacher')
            if teacher_id:
                qs = qs.filter(teacher_id=teacher_id)
            elif self.action == 'list' and not self.request.query_params.get('all'):
                qs = qs.filter(teacher=user)
            return qs
        return qs.filter(teacher=user)

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        ids = [a.id for a in page]
        progress = assignment_progress_counts(ids)
        sizes = class_student_counts({a.journal_class_id for a in page})
        stats = {a.id: {**progress.get(a.id, {'submitted': 0, 'avg_percent': None}), 'students': sizes.get(a.journal_class_id, 0)}
                 for a in page}
        serializer = self.get_serializer(page, many=True, context={**self.get_serializer_context(), 'stats': stats})
        return self.get_paginated_response(serializer.data)

    def _check_owner(self, assignment):
        if assignment.teacher_id != self.request.user.id:
            raise PermissionDenied("Bu vazifa sizniki emas.")

    def perform_create(self, serializer):
        assignment = serializer.save(teacher=self.request.user)
        self._notify_students(assignment)

    def perform_update(self, serializer):
        self._check_owner(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_owner(instance)
        instance.delete()

    def _notify_students(self, assignment):
        if not assignment.is_published:
            return
        due = timezone.localtime(assignment.due_at).strftime('%d.%m %H:%M') if assignment.due_at else "muddatsiz"
        text = f"📚 Yangi uyga vazifa: «{assignment.title}» (muddat: {due}). Platformadagi «Uyga vazifa» bo'limini oching."
        for user in User.objects.filter(
            student_profile__journal_class=assignment.journal_class, approved=True, is_active=True, telegram_linked=True,
        )[:200]:
            notify_user(user, text)

    @action(detail=True, methods=['get'])
    def results(self, request, pk=None):
        """Every student of the class with their status on this assignment
        — including the ones who haven't started (that's the point)."""
        assignment = self.get_object()
        students = list(
            User.objects.filter(student_profile__journal_class=assignment.journal_class, approved=True, is_active=True)
            .order_by('name')
        )
        attempts = list(Attempt.objects.filter(assignment=assignment).order_by('-submitted_at'))
        by_user: dict[str, list] = {}
        for a in attempts:
            by_user.setdefault(a.user_id, []).append(a)
        rows = []
        for s in students:
            mine = by_user.get(s.id, [])
            submitted = [a for a in mine if a.submitted_at]
            best = max(submitted, key=lambda a: a.percent, default=None)
            rows.append({
                'user': s.id, 'name': s.name,
                'state': 'submitted' if submitted else ('in_progress' if mine else ('overdue' if assignment.is_overdue else 'todo')),
                'attempts': len(submitted),
                'best_percent': best.percent if best else None,
                'best_attempt': best.id if best else None,
                'is_late': best.is_late if best else False,
                'submitted_at': best.submitted_at if best else None,
                'duration_sec': best.duration_sec if best else None,
            })
        submitted = [a for a in attempts if a.submitted_at]
        return Response({
            'assignment': AssignmentSerializer(assignment, context=self.get_serializer_context()).data,
            'rows': rows,
            'question_stats': analytics.question_stats(submitted),
        })


class AttemptViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Results feed for teachers (own classes) and administration (all)."""

    serializer_class = AttemptSummarySerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        user = self.request.user
        qs = Attempt.objects.filter(submitted_at__isnull=False).select_related('user', 'lesson', 'assignment')
        kind = self.request.query_params.get('kind')
        if kind == Attempt.Kind.READINESS:
            qs = qs.filter(kind=kind)
            if not user.is_oversight:
                qs = qs.filter(user=user)
            teacher_id = self.request.query_params.get('teacher')
            if teacher_id and user.is_oversight:
                qs = qs.filter(user_id=teacher_id)
            return qs
        qs = qs.filter(user__in=visible_students(user))
        if kind:
            qs = qs.filter(kind=kind)
        class_id = _int_param(self.request, 'class')
        if class_id:
            qs = qs.filter(user__student_profile__journal_class_id=class_id)
        teacher_id = self.request.query_params.get('teacher')
        if teacher_id and user.is_oversight:
            qs = qs.filter(user__student_profile__journal_class__teacher_id=teacher_id)
        student = self.request.query_params.get('student')
        if student:
            qs = qs.filter(user_id=student)
        return qs.order_by('-submitted_at')

    def retrieve(self, request, pk=None):
        attempt = get_object_or_404(Attempt, pk=pk, submitted_at__isnull=False)
        user = request.user
        if attempt.kind == Attempt.Kind.READINESS:
            allowed = attempt.user_id == user.id or user.is_oversight
        else:
            allowed = visible_students(user).filter(pk=attempt.user_id).exists()
        if not allowed:
            raise PermissionDenied("Bu natijani ko'rish huquqingiz yo'q.")
        return Response({**AttemptSummarySerializer(attempt).data, 'items': review_items(attempt, reveal=True)})


# ── Teacher readiness check ───────────────────────────────────────────

class ReadinessStartView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request, lesson_id):
        lesson = get_object_or_404(Lesson, pk=lesson_id)
        items = build_readiness_snapshot(lesson)
        if len(items) < 3:
            raise ValidationError({'detail': "Bu dars bo'yicha savol tuzish uchun ma'lumot yetarli emas "
                                             "(tajriba bosqichlari, jihozlar yoki formulalar kiritilmagan)."})
        attempt = Attempt.objects.create(user=request.user, kind=Attempt.Kind.READINESS, lesson=lesson, snapshot=items)
        return Response(attempt_payload(attempt), status=status.HTTP_201_CREATED)


class ReadinessSubmitView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(Attempt, pk=attempt_id, user=request.user, kind=Attempt.Kind.READINESS)
        submit_attempt(attempt, request.data.get('answers'))
        return Response({
            **AttemptSummarySerializer(attempt).data,
            'passed': attempt.percent >= PASS_PERCENT,
            'pass_percent': PASS_PERCENT,
            'items': review_items(attempt, reveal=True),
        })


class ReadinessStatusView(APIView):
    """Best readiness result per lesson for the current teacher — drives
    the "Tayyor ✓" badge on the lessons list."""

    permission_classes = [IsApproved]

    def get(self, request):
        rows = (
            Attempt.objects.filter(user=request.user, kind=Attempt.Kind.READINESS, submitted_at__isnull=False,
                                   lesson__isnull=False)
            .values('lesson').annotate(n=Count('id'), best=Max('percent'))
        )
        return Response({
            str(r['lesson']): {'attempts': r['n'], 'best_percent': r['best'], 'passed': (r['best'] or 0) >= PASS_PERCENT}
            for r in rows
        })


# ── Lesson reports ("dars hisoboti") ──────────────────────────────────

class LessonReportViewSet(viewsets.ModelViewSet):
    serializer_class = LessonReportSerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        user = self.request.user
        qs = LessonReport.objects.select_related('teacher', 'journal_class', 'lesson', 'reviewed_by', 'readiness_attempt')
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        if user.is_oversight:
            teacher_id = self.request.query_params.get('teacher')
            if teacher_id:
                return qs.filter(teacher_id=teacher_id)
            if self.request.query_params.get('mine'):
                return qs.filter(teacher=user)
            return qs
        return qs.filter(teacher=user)

    def _latest_readiness(self, lesson):
        if not lesson:
            return None
        return (
            Attempt.objects.filter(user=self.request.user, kind=Attempt.Kind.READINESS, lesson=lesson, submitted_at__isnull=False)
            .order_by('-percent', '-submitted_at').first()
        )

    def perform_create(self, serializer):
        if self.request.user.is_observer:
            raise PermissionDenied("Kuzatuvchi faqat ko'ra oladi.")
        lesson = serializer.validated_data.get('lesson')
        report = serializer.save(teacher=self.request.user, readiness_attempt=self._latest_readiness(lesson))
        notify_admin_action(self.request.user, f"Dars hisobotini topshirdi: «{report.topic}» ({report.date:%d.%m.%Y})")

    def perform_update(self, serializer):
        report = serializer.instance
        if report.teacher_id != self.request.user.id:
            raise PermissionDenied("Faqat o'z hisobotingizni tahrirlay olasiz.")
        if report.status == LessonReport.Status.REVIEWED:
            raise ValidationError({'detail': "Baholangan hisobotni o'zgartirib bo'lmaydi."})
        lesson = serializer.validated_data.get('lesson', report.lesson)
        serializer.save(status=LessonReport.Status.SUBMITTED, readiness_attempt=self._latest_readiness(lesson))

    def perform_destroy(self, instance):
        if instance.teacher_id != self.request.user.id or instance.status == LessonReport.Status.REVIEWED:
            raise PermissionDenied("Bu hisobotni o'chirib bo'lmaydi.")
        instance.delete()

    @action(detail=True, methods=['post'], permission_classes=[IsAdminOrDevSuperuser])
    def review(self, request, pk=None):
        if not request.user.is_admin:
            raise PermissionDenied("Baholash faqat ma'muriyat uchun.")
        report = self.get_object()
        if report.teacher_id == request.user.id:
            raise PermissionDenied("O'z hisobotingizni baholay olmaysiz.")
        data = ReportReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        report.status = data.validated_data['status']
        report.rating = data.validated_data.get('rating') if report.status == LessonReport.Status.REVIEWED else None
        report.review_comment = data.validated_data.get('review_comment', '')
        report.reviewed_by = request.user
        report.reviewed_at = timezone.now()
        report.save()
        verdict = f"{report.rating}/5" if report.rating else "qayta ishlashga qaytarildi"
        notify_user(report.teacher, f"📝 Dars hisobotingiz («{report.topic}») ko'rib chiqildi: {verdict}."
                                    + (f"\nIzoh: {report.review_comment}" if report.review_comment else ''))
        notify_admin_action(request.user, f"Dars hisobotini baholadi: {report.teacher.name} — «{report.topic}» — {verdict}")
        return Response(LessonReportSerializer(report).data)


# ── Awards (rag'batlantirish) ─────────────────────────────────────────

class AwardViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin, viewsets.GenericViewSet):
    serializer_class = AwardSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsAdminOrDevSuperuser()]

    def get_queryset(self):
        user = self.request.user
        qs = Award.objects.select_related('recipient', 'granted_by')
        if user.is_oversight:
            role = self.request.query_params.get('role')
            if role == 'student':
                qs = qs.filter(recipient__role=User.Role.STUDENT)
            elif role == 'staff':
                qs = qs.exclude(recipient__role=User.Role.STUDENT)
            return qs
        # Teachers: their own awards + their students'.
        return qs.filter(Q(recipient=user) | Q(recipient__student_profile__journal_class__teacher=user))

    def perform_create(self, serializer):
        award = serializer.save(granted_by=self.request.user)
        notify_user(award.recipient, f"🏆 Tabriklaymiz! Sizga «{award.title}» rag'bati berildi."
                                     + (f"\n{award.reason}" if award.reason else ''))
        notify_admin_action(self.request.user, f"Rag'bat berdi: {award.recipient.name} — «{award.title}»")

    def perform_destroy(self, instance):
        notify_admin_action(self.request.user, f"Rag'batni bekor qildi: {instance.recipient.name} — «{instance.title}»")
        instance.delete()


# ── Analytics ─────────────────────────────────────────────────────────

class AnalyticsView(APIView):
    """GET /api/learning/analytics/<report>/ — teachers get their own
    classes, administration (incl. Kuzatuvchi) everything with optional
    ?teacher=&class=&grade= filters. Cached briefly per viewer+params."""

    permission_classes = [IsApproved]
    CACHE_SECONDS = 120
    REPORTS = ('overview', 'top-students', 'top-teachers', 'best-reports', 'classes', 'lessons')

    def get(self, request, report):
        if report not in self.REPORTS:
            return Response({'detail': 'Topilmadi.'}, status=status.HTTP_404_NOT_FOUND)
        params = {k: request.query_params.get(k, '') for k in ('period', 'teacher', 'class', 'grade', 'limit')}
        raw_key = json.dumps([report, request.user.id, request.user.is_oversight, params], sort_keys=True)
        key = 'analytics:' + hashlib.sha256(raw_key.encode()).hexdigest()
        data = cache.get(key)
        if data is None:
            data = self._compute(request, report, params)
            cache.set(key, data, self.CACHE_SECONDS)
        return Response(data)

    def _compute(self, request, report, params):
        user = request.user
        since = analytics.period_start(params['period'] or 'month')
        teacher_id = params['teacher'] or None
        class_id = _int_param(request, 'class')
        grade = _int_param(request, 'grade')
        limit = min(_int_param(request, 'limit') or 20, 100)
        scope = {'teacher_id': teacher_id, 'class_id': class_id, 'grade': grade}
        if report == 'overview':
            return {**analytics.overview(user, since, **scope), **analytics.lessons_summary()}
        if report == 'top-students':
            return analytics.top_students(user, since, limit=limit, **scope)
        if report == 'top-teachers':
            return analytics.top_teachers(user, since, limit=limit)
        if report == 'best-reports':
            return LessonReportSerializer(analytics.best_reports(user, since, limit=limit), many=True).data
        if report == 'classes':
            return analytics.class_compare(user, since, teacher_id=teacher_id)
        return analytics.lesson_stats(user, since, grade=grade)


class TeachersListView(APIView):
    """Light teacher list for oversight filters."""

    permission_classes = [IsOversight]

    def get(self, request):
        rows = (
            User.objects.filter(is_active=True).exclude(role__in=[User.Role.STUDENT, User.Role.KUZATUVCHI])
            .filter(Q(classes__isnull=False) | Q(lesson_reports__isnull=False) | Q(role=User.Role.TEACHER))
            .distinct().order_by('name').values('id', 'name', 'role')
        )
        return Response(list(rows))
