"""Ustozlar xonasi (/api/staffroom/).

  day/?date=       — the teacher's school day (default: the next one)
  plan/            — pick the lesson for one hour of a day
  guests/          — "mehmon ustoz" requests: one's own; the
                     administration sees and answers them all
"""

from datetime import date

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from common.permissions import IsApproved
from common.security import log_event
from lessons.models import Lesson
from lessons.visibility import visible_lessons
from common.subjects import main_subject, subject_of_grade, window
from notifications.models import Kind as NotifyKind
from notifications.service import notify

from .calendar import next_school_day
from .models import GuestRequest, PlannedLesson
from .services import day_plan


def _teacher(request):
    u = request.user
    if not u.is_staff_member or u.is_observer or u.is_school_admin:
        raise PermissionDenied("Bu bo'lim o'qituvchilar uchun.")


def _day(raw) -> date:
    if not raw:
        return next_school_day(timezone.localdate())
    if raw == 'today':
        return timezone.localdate()
    try:
        return date.fromisoformat(str(raw))
    except ValueError:
        raise ValidationError({'date': "Sana noto'g'ri."})


class DayView(APIView):
    permission_classes = [IsApproved]

    def get(self, request):
        _teacher(request)
        day = _day(request.query_params.get('date'))
        return Response({**day_plan(request.user, day, window(request)), 'today': timezone.localdate()})


class PlanView(APIView):
    """{date, period, lesson: id | null} — null clears the hour's lesson;
    {date, period, reset: true} goes back to the calendar's guess."""

    permission_classes = [IsApproved]

    def post(self, request):
        _teacher(request)
        day = _day(request.data.get('date'))
        try:
            period = int(request.data.get('period'))
        except (TypeError, ValueError):
            raise ValidationError({'period': "Soat ko'rsatilmagan."})
        if request.data.get('reset'):
            PlannedLesson.objects.filter(teacher=request.user, date=day, period_index=period).delete()
            return Response({'ok': True})
        lesson = None
        if request.data.get('lesson'):
            lesson = get_object_or_404(visible_lessons(Lesson.objects.all(), request.user, window(request)), pk=request.data['lesson'])
        PlannedLesson.objects.update_or_create(teacher=request.user, date=day, period_index=period,
                                               defaults={'lesson': lesson})
        return Response({'ok': True})


class GuestRequestSerializer(serializers.ModelSerializer):
    requester_name = serializers.CharField(source='requester.name', read_only=True)
    guest_name = serializers.CharField(source='guest.name', read_only=True, default='')
    handled_by_name = serializers.CharField(source='handled_by.name', read_only=True, default='')
    lesson_title = serializers.CharField(source='lesson.title', read_only=True, default='')
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = GuestRequest
        fields = [
            'id', 'requester', 'requester_name', 'school', 'school_name', 'class_name', 'date', 'time', 'lesson',
            'lesson_title', 'topic', 'note', 'status', 'status_label', 'guest', 'guest_name', 'reply',
            'handled_by_name', 'handled_at', 'created_at',
        ]
        read_only_fields = ['requester', 'status', 'guest', 'reply', 'handled_at', 'created_at']

    def validate_date(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError("O'tgan kunga mehmon ustoz chaqirib bo'lmaydi.")
        return value

    def validate(self, attrs):
        for f, n in (('school_name', 255), ('class_name', 64), ('time', 32), ('topic', 255)):
            if f in attrs:
                attrs[f] = (attrs[f] or '').strip()[:n]
        if 'note' in attrs:
            attrs['note'] = (attrs['note'] or '').strip()[:2000]
        if not (attrs.get('class_name') or attrs.get('school_name') or attrs.get('school')):
            raise serializers.ValidationError({'class_name': "Maktab va sinfni ko'rsating."})
        return attrs


def _admins():
    return list(User.objects.filter(is_active=True).filter(
        Q(is_dev_superuser=True) | Q(role__in=[User.Role.ADMIN, User.Role.BOSHLIQ])))


def _when(g: GuestRequest) -> str:
    return f"{g.date:%d.%m.%Y}{f', {g.time}' if g.time else ''}"


def _where(g: GuestRequest) -> str:
    school = g.school.name if g.school else g.school_name
    return ' '.join(p for p in (school, g.class_name) if p)


class GuestRequestsView(APIView):
    permission_classes = [IsApproved]

    def get(self, request):
        qs = GuestRequest.objects.select_related('requester', 'guest', 'handled_by', 'lesson', 'school')
        if request.user.is_oversight and request.query_params.get('all') == '1':
            st = request.query_params.get('status')
            if st == 'open':
                qs = qs.filter(status__in=[GuestRequest.Status.NEW, GuestRequest.Status.ACCEPTED])
            elif st:
                qs = qs.filter(status=st)
        else:
            qs = qs.filter(Q(requester=request.user) | Q(guest=request.user))
        if (fan := window(request)):  # the Fizika or STEAM window's requests
            qs = qs.filter(fan__in=['', fan])
        return Response(GuestRequestSerializer(qs[:300], many=True).data)

    def post(self, request):
        _teacher(request)
        s = GuestRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        lesson = s.validated_data.get('lesson')
        fan = subject_of_grade(lesson.grade) if lesson else (window(request) or main_subject(request.user))
        g = s.save(requester=request.user, fan=fan)
        if g.school and not g.school_name:
            g.school_name = g.school.name
            g.save(update_fields=['school_name'])
        notify([a for a in _admins() if a.id != request.user.id], NotifyKind.USTOZ,
               f"Mehmon ustoz so'raldi: {request.user.name}",
               f"{_where(g)} · {_when(g)}{f' · {g.lesson.title}' if g.lesson else (f' · {g.topic}' if g.topic else '')}",
               url='/staffroom?bolim=sorovlar', fan=g.fan)
        log_event('guest_requested', actor=request.user, request=request, detail=f'{_where(g)} {_when(g)}')
        return Response(GuestRequestSerializer(g).data, status=status.HTTP_201_CREATED)


ANSWERS = {GuestRequest.Status.ACCEPTED, GuestRequest.Status.DECLINED, GuestRequest.Status.DONE}


class GuestRequestView(APIView):
    """PATCH {status, guest, reply}: the administration answers (accept
    with a guest teacher, decline, mark held); the requester may only
    cancel a request nobody has answered yet."""

    permission_classes = [IsApproved]

    def patch(self, request, pk):
        g = get_object_or_404(GuestRequest.objects.select_related('requester', 'lesson', 'school'), pk=pk)
        new = request.data.get('status')
        user = request.user
        if new == GuestRequest.Status.CANCELLED:
            if g.requester_id != user.id:
                raise PermissionDenied("Faqat so'rov egasi bekor qila oladi.")
            if g.status != GuestRequest.Status.NEW:
                raise ValidationError({'detail': "Javob berilgan so'rovni bekor qilib bo'lmaydi — ma'muriyatga yozing."})
            g.status = new
            g.save(update_fields=['status'])
            return Response(GuestRequestSerializer(g).data)
        if not user.is_admin:
            raise PermissionDenied('Bu amal faqat administrator uchun.')
        if new not in ANSWERS:
            raise ValidationError({'status': "Holat noto'g'ri."})
        guest = None
        if new == GuestRequest.Status.ACCEPTED:
            if not request.data.get('guest'):
                raise ValidationError({'guest': "Mehmon ustozni tanlang."})
            guest = get_object_or_404(
                User.objects.filter(is_active=True).exclude(role__in=[User.Role.STUDENT, User.Role.MAKTAB]),
                pk=request.data['guest'])
        prev_guest = g.guest
        g.status = new
        if guest is not None:
            g.guest = guest
        g.reply = str(request.data.get('reply') or '').strip()[:2000]
        g.handled_by, g.handled_at = user, timezone.now()
        g.save()
        label = g.get_status_display()
        body = f"{_where(g)} · {_when(g)}" + (f" · Mehmon ustoz: {g.guest.name}" if g.guest else '') + (f"\n{g.reply}" if g.reply else '')
        if new != GuestRequest.Status.DONE:
            notify(g.requester, NotifyKind.USTOZ, f"Mehmon ustoz so'rovingiz: {label.lower()}", body, url='/staffroom?bolim=mehmon',
                   fan=g.fan)
        if guest is not None and guest != prev_guest and guest.id != user.id:
            notify(guest, NotifyKind.USTOZ, f"Siz mehmon ustoz sifatida taklif qilindingiz: {_where(g)}",
                   f"{_when(g)} · {g.requester.name}" + (f" · {g.lesson.title}" if g.lesson else '') + (f"\n{g.reply}" if g.reply else ''),
                   url='/staffroom?bolim=mehmon', fan=g.fan)
        log_event('guest_answered', actor=user, request=request, detail=f'{_where(g)} {_when(g)}: {label}')
        return Response(GuestRequestSerializer(g).data)
