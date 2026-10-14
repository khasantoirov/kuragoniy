"""Student portal API (/api/student/) — the only API surface a student
account can reach besides auth/me and games (common/authentication.py).

Everything here is scoped to request.user: a student only ever sees their
own class's assignments, their own attempts, and lesson material that an
admin has published. Correct answers never leave the server before an
attempt is submitted (grading.py)."""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.audit import notify_user
from common.permissions import IsStudent
from common.security import log_event
from common.throttling import StudentRegisterRateThrottle
from lessons.models import Lesson

from .grading import review_items
from .models import Assignment, Attempt, Award, ClassInvite, LessonMaterial, LessonProgress
from .serializers import AttemptSummarySerializer, AwardSerializer
from .services import (
    attempt_payload,
    class_leaderboard,
    homework_status,
    lesson_bank,
    reveal_answers,
    start_homework,
    start_practice,
    student_xp,
    submit_attempt,
)
from .student_accounts import USERNAME_RE, create_student_account, normalize_username


def _profile(request):
    profile = getattr(request.user, 'student_profile', None)
    if profile is None or profile.journal_class_id is None:
        raise ValidationError({'detail': "Siz hali biror sinfga biriktirilmagansiz. O'qituvchingizga murojaat qiling."})
    return profile


def _student_lessons(profile):
    published = LessonMaterial.objects.filter(is_published=True).values_list('lesson_id', flat=True)
    qs = Lesson.objects.filter(id__in=published)
    if profile.grade:
        qs = qs.filter(grade=profile.grade)
    return qs


def _invite(code):
    code = str(code or '').strip().upper().replace(' ', '').replace('-', '')
    if not code:
        return None
    return ClassInvite.objects.select_related('journal_class', 'journal_class__teacher').filter(code=code, is_active=True).first()


class JoinInfoView(APIView):
    """Public: what class a join code belongs to, so the student can check
    they typed the right one before registering."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [StudentRegisterRateThrottle]

    def get(self, request):
        inv = _invite(request.query_params.get('code'))
        if not inv:
            return Response({'detail': "Kod topilmadi yoki faol emas."}, status=status.HTTP_404_NOT_FOUND)
        jc = inv.journal_class
        return Response({'class_name': jc.name, 'school': jc.school, 'teacher_name': jc.teacher.name,
                         'auto_approve': inv.auto_approve})


class StudentRegisterView(APIView):
    """Self-registration with a class join code. Approved straight away
    only if the teacher enabled auto-approve on the code; otherwise the
    account waits for the teacher."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [StudentRegisterRateThrottle]

    def post(self, request):
        inv = _invite(request.data.get('code'))
        if not inv:
            raise ValidationError({'code': "Sinf kodi noto'g'ri yoki faol emas."})
        full_name = ' '.join(str(request.data.get('full_name') or '').split())
        if not 5 <= len(full_name) <= 150 or len(full_name.split()) < 2:
            raise ValidationError({'full_name': "Familiya va ismingizni to'liq yozing."})
        username = normalize_username(request.data.get('username'))
        if username:
            if not USERNAME_RE.match(username):
                raise ValidationError({'username': "Login 3–40 belgi: lotin harflari, raqamlar, nuqta yoki pastki chiziq."})
            if User.objects.filter(username__iexact=username).exists():
                raise ValidationError({'username': "Bu login band. Boshqasini tanlang."})
        password = str(request.data.get('password') or '')
        try:
            validate_password(password, user=User(username=username or '', name=full_name))
        except DjangoValidationError as exc:
            raise ValidationError({'password': list(exc.messages)})

        with transaction.atomic():
            user, _ = create_student_account(
                full_name=full_name, journal_class=inv.journal_class, username=username or None,
                password=password, approved=inv.auto_approve, must_change_password=False,
            )
        log_event('register_student', actor=user, request=request, detail=f'{inv.journal_class.name} ({inv.code})')
        notify_user(
            inv.journal_class.teacher,
            f"👤 {user.name} «{inv.journal_class.name}» sinfiga ro'yxatdan o'tdi"
            + ("." if inv.auto_approve else " — tasdiqlashingizni kutmoqda (O'quvchilar bo'limi)."),
        )
        return Response({'username': user.username, 'approved': user.approved}, status=status.HTTP_201_CREATED)


class StudentDashboardView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        user = request.user
        profile = _profile(request)
        assignments = list(
            Assignment.objects.filter(journal_class=profile.journal_class, is_published=True)
            .select_related('lesson').order_by('-created_at')[:30]
        )
        by_assignment: dict[int, list] = {}
        for a in Attempt.objects.filter(user=user, assignment__in=assignments):
            by_assignment.setdefault(a.assignment_id, []).append(a)
        pending = []
        for a in assignments:
            st = homework_status(user, a, by_assignment)
            if st['state'] in ('todo', 'in_progress'):
                pending.append({'id': a.id, 'title': a.title, 'due_at': a.due_at, 'state': st['state']})
        pending.sort(key=lambda x: (x['due_at'] is None, x['due_at'] or timezone.now()))

        recent = Attempt.objects.filter(user=user, submitted_at__isnull=False).select_related('lesson', 'assignment')[:5]
        board = class_leaderboard(profile.journal_class)
        my_rank = next((r['rank'] for r in board if r['user'] == user.id), None)
        submitted = Attempt.objects.filter(user=user, submitted_at__isnull=False)
        avg = submitted.filter(kind__in=[Attempt.Kind.HOMEWORK, Attempt.Kind.PRACTICE]).values_list('percent', flat=True)
        avg_list = list(avg)
        return Response({
            'xp': student_xp(user),
            'pending_homework': pending[:5],
            'pending_count': len(pending),
            'recent_results': AttemptSummarySerializer(recent, many=True).data,
            'avg_percent': round(sum(avg_list) / len(avg_list), 1) if avg_list else None,
            'attempts': len(avg_list),
            'class_rank': my_rank,
            'class_size': len(board),
            'awards': AwardSerializer(Award.objects.filter(recipient=user)[:5], many=True).data,
            'lessons_available': _student_lessons(profile).count(),
        })


class StudentLessonsView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        profile = _profile(request)
        lessons = list(_student_lessons(profile).order_by('grade', 'chorak', 'hafta'))
        progress = {p.lesson_id: p for p in LessonProgress.objects.filter(user=request.user, lesson__in=lessons)}
        counts = {}
        for row in (
            Lesson.objects.filter(id__in=[lesson.id for lesson in lessons])
            .annotate(n=Count('questions', filter=Q(questions__audience='student', questions__assignment__isnull=True)))
            .values('id', 'n')
        ):
            counts[row['id']] = row['n']
        out = []
        for lesson in lessons:
            p = progress.get(lesson.id)
            out.append({
                'id': lesson.id, 'title': lesson.title, 'title_ru': lesson.title_ru, 'title_en': lesson.title_en,
                'grade': lesson.grade, 'chorak': lesson.chorak, 'hafta': lesson.hafta, 'cat': lesson.cat,
                'question_count': counts.get(lesson.id, 0),
                'progress': {
                    'opened': bool(p), 'theory_done': bool(p and p.theory_done), 'video_done': bool(p and p.video_done),
                    'best_percent': p.best_percent if p else None, 'completed': bool(p and p.completed_at),
                },
            })
        return Response(out)


class StudentLessonDetailView(APIView):
    permission_classes = [IsStudent]

    def _lesson(self, request, lesson_id):
        profile = _profile(request)
        return get_object_or_404(_student_lessons(profile), pk=lesson_id)

    def get(self, request, lesson_id):
        lesson = self._lesson(request, lesson_id)
        material = lesson.material
        progress, _ = LessonProgress.objects.get_or_create(user=request.user, lesson=lesson)
        experiments = [
            {'id': e.id, 'name': e.name, 'type': e.type, 'desc': e.desc, 'video': e.video, 'image': e.image,
             'minutes': e.minutes, 'safety': e.safety}
            for e in lesson.experiments.all()
        ]
        return Response({
            'id': lesson.id, 'title': lesson.title, 'title_ru': lesson.title_ru, 'title_en': lesson.title_en,
            'grade': lesson.grade, 'chorak': lesson.chorak, 'hafta': lesson.hafta, 'goal': lesson.goal,
            'sim_id': lesson.sim_id,
            'theory': material.theory, 'formulas': material.formulas, 'video_url': material.video_url,
            'extra_videos': material.extra_videos, 'experiments': experiments,
            'question_count': lesson_bank(lesson.id).count(),
            'progress': {
                'theory_done': progress.theory_done, 'video_done': progress.video_done,
                'best_percent': progress.best_percent, 'completed': bool(progress.completed_at),
            },
        })

    def post(self, request, lesson_id):
        """Progress marks: {theory_done?: true, video_done?: true}."""
        lesson = self._lesson(request, lesson_id)
        progress, _ = LessonProgress.objects.get_or_create(user=request.user, lesson=lesson)
        changed = []
        for f in ('theory_done', 'video_done'):
            if request.data.get(f) is True and not getattr(progress, f):
                setattr(progress, f, True)
                changed.append(f)
        if changed:
            progress.save(update_fields=changed)
        return Response({'theory_done': progress.theory_done, 'video_done': progress.video_done})


class StudentPracticeStartView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, lesson_id):
        profile = _profile(request)
        lesson = get_object_or_404(_student_lessons(profile), pk=lesson_id)
        attempt = start_practice(request.user, lesson)
        return Response(attempt_payload(attempt), status=status.HTTP_201_CREATED)


class StudentAssignmentsView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        profile = _profile(request)
        assignments = list(
            Assignment.objects.filter(journal_class=profile.journal_class, is_published=True)
            .select_related('lesson', 'teacher').order_by('-created_at')[:100]
        )
        by_assignment: dict[int, list] = {}
        for a in Attempt.objects.filter(user=request.user, assignment__in=assignments):
            by_assignment.setdefault(a.assignment_id, []).append(a)
        return Response([
            {
                'id': a.id, 'title': a.title, 'instructions': a.instructions, 'lesson': a.lesson_id,
                'lesson_title': a.lesson.title if a.lesson else '', 'teacher_name': a.teacher.name,
                'due_at': a.due_at, 'max_attempts': a.max_attempts, 'created_at': a.created_at,
                'is_overdue': a.is_overdue, **homework_status(request.user, a, by_assignment),
            }
            for a in assignments
        ])


class StudentAssignmentStartView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, assignment_id):
        profile = _profile(request)
        assignment = get_object_or_404(
            Assignment, pk=assignment_id, journal_class=profile.journal_class, is_published=True,
        )
        attempt = start_homework(request.user, assignment)
        return Response(attempt_payload(attempt), status=status.HTTP_201_CREATED)


class StudentAttemptView(APIView):
    permission_classes = [IsStudent]

    def get(self, request, attempt_id):
        attempt = get_object_or_404(Attempt, pk=attempt_id, user=request.user)
        if not attempt.submitted_at:
            return Response(attempt_payload(attempt))
        reveal = reveal_answers(attempt, request.user)
        return Response({**AttemptSummarySerializer(attempt).data, 'revealed': reveal,
                         'items': review_items(attempt, reveal=reveal)})


class StudentAttemptSubmitView(APIView):
    permission_classes = [IsStudent]

    def post(self, request, attempt_id):
        attempt = get_object_or_404(
            Attempt.objects.select_related('assignment'), pk=attempt_id, user=request.user,
            kind__in=[Attempt.Kind.PRACTICE, Attempt.Kind.HOMEWORK],
        )
        submit_attempt(attempt, request.data.get('answers'))
        reveal = reveal_answers(attempt, request.user)
        return Response({**AttemptSummarySerializer(attempt).data, 'revealed': reveal,
                         'items': review_items(attempt, reveal=reveal), 'xp': student_xp(request.user)})


class StudentResultsView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        attempts = Attempt.objects.filter(user=request.user, submitted_at__isnull=False).select_related(
            'lesson', 'assignment')[:200]
        return Response(AttemptSummarySerializer(attempts, many=True).data)


class StudentLeaderboardView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        profile = _profile(request)
        board = class_leaderboard(profile.journal_class)
        for row in board:
            row['is_me'] = row['user'] == request.user.id
            row.pop('user')
        return Response({'class_name': profile.journal_class.name, 'rows': board})


class StudentAwardsView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        return Response(AwardSerializer(Award.objects.filter(recipient=request.user), many=True).data)


class StudentJoinClassView(APIView):
    """An existing student moving to a new class with its join code (new
    school year, transfer). Goes back to pending unless auto-approve."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if not user.is_student:
            raise ValidationError({'detail': "Faqat o'quvchi hisobi uchun."})
        inv = _invite(request.data.get('code'))
        if not inv:
            raise ValidationError({'code': "Sinf kodi noto'g'ri yoki faol emas."})
        from .student_accounts import grade_from_class_name

        profile = user.student_profile
        if profile.journal_class_id == inv.journal_class_id:
            return Response({'detail': "Siz allaqachon shu sinfdasiz."})
        profile.journal_class = inv.journal_class
        profile.roster_entry = None
        profile.grade = grade_from_class_name(inv.journal_class.name) or profile.grade
        profile.save(update_fields=['journal_class', 'roster_entry', 'grade'])
        if not inv.auto_approve:
            user.approved = False
            user.save(update_fields=['approved'])
        log_event('student_joined_class', actor=user, request=request, detail=inv.journal_class.name)
        return Response({'approved': user.approved, 'class_name': inv.journal_class.name})
