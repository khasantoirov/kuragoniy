from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from accounts.models import User
from common.audit import notify_admin_action
from common.permissions import IsApproved

from .models import TimetableSlot
from .serializers import TimetableSlotSerializer

DAYS = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma']
_SLOT_FIELDS = ('time_from', 'time_to', 'maktab', 'xona', 'sinf', 'span', 'band')


def _slot_label(day_index, period_index):
    day = DAYS[day_index] if 0 <= day_index < len(DAYS) else f'{day_index}-kun'
    return f"{day}, {period_index}-soat"


def _fmt_time(t) -> str:
    return t.strftime('%H:%M') if t else ''


def _slot_desc(values: dict) -> str:
    time = f"{_fmt_time(values.get('time_from'))}–{_fmt_time(values.get('time_to'))}".strip('–')
    parts = [p for p in (time, values.get('maktab'), values.get('xona'), values.get('sinf')) if p]
    return ', '.join(parts) if parts else "(bo'sh)"


def _timetable_diff(before: dict, after: dict, max_lines: int = 8) -> str:
    """`before`/`after` are {(day_index, period_index): field-dict}. One
    line per slot that was added, removed, or actually changed — capped at
    `max_lines` so a full-week paste doesn't produce a wall of text."""
    keys = sorted(set(before) | set(after))
    lines = []
    for k in keys:
        old, new = before.get(k), after.get(k)
        if old == new:
            continue
        label = _slot_label(*k)
        if old is None:
            lines.append(f"+ {label}: {_slot_desc(new)}")
        elif new is None:
            lines.append(f"- {label}: {_slot_desc(old)}")
        else:
            lines.append(f"~ {label}: {_slot_desc(old)} → {_slot_desc(new)}")
    if len(lines) > max_lines:
        lines = lines[:max_lines] + [f"… yana {len(lines) - max_lines} ta o'zgarish"]
    return '\n'.join(lines)


class TimetableSlotViewSet(viewsets.ModelViewSet):
    """Owner CRUD; any approved user may *read* another teacher's week via
    ?teacher=<id> (the "Barcha o'qituvchilar" view is visible to everyone,
    for schedule coordination), but only admin/boshliq/dev-superuser
    (is_admin) may *write* to someone else's — see _target_teacher's
    `require_write_permission`."""

    serializer_class = TimetableSlotSerializer
    permission_classes = [IsApproved]

    def _target_teacher(self, request, *, require_write_permission=False):
        teacher_id = request.query_params.get('teacher')
        if not teacher_id:
            return request.user
        if require_write_permission and not request.user.is_admin:
            raise PermissionDenied("Faqat administrator boshqa o'qituvchi jadvalini tahrirlay oladi.")
        return get_object_or_404(User, id=teacher_id)

    def get_queryset(self):
        return TimetableSlot.objects.filter(teacher=self._target_teacher(self.request))

    def perform_create(self, serializer):
        serializer.save(teacher=self._target_teacher(self.request, require_write_permission=True))

    def perform_update(self, serializer):
        # get_object() (used to fetch `serializer.instance`) resolves its
        # queryset via the read-permissive _target_teacher — re-check with
        # require_write_permission here so PATCH/PUT on another teacher's
        # slot still needs is_admin, matching create/bulk.
        self._target_teacher(self.request, require_write_permission=True)
        serializer.save()

    def perform_destroy(self, instance):
        self._target_teacher(self.request, require_write_permission=True)
        instance.delete()

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """Replaces the target teacher's entire week in one request —
        matches the old UX of editing the whole timetable grid and saving
        at once. Target defaults to the caller; an is_admin caller may pass
        ?teacher=<id> to edit someone else's (see _target_teacher)."""
        teacher = self._target_teacher(request, require_write_permission=True)
        serializer = TimetableSlotSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)

        is_cross_teacher = bool(request.query_params.get('teacher'))
        before = {}
        if is_cross_teacher:
            before = {
                (row['day_index'], row['period_index']): row
                for row in TimetableSlot.objects.filter(teacher=teacher).values('day_index', 'period_index', *_SLOT_FIELDS)
            }

        TimetableSlot.objects.filter(teacher=teacher).delete()
        slots = [
            TimetableSlot(teacher=teacher, **item)
            for item in serializer.validated_data
        ]
        TimetableSlot.objects.bulk_create(slots)

        if is_cross_teacher:
            after = {(item['day_index'], item['period_index']): item for item in serializer.validated_data}
            diff = _timetable_diff(before, after)
            if diff:
                notify_admin_action(request.user, f"{teacher.name}ning dars jadvalini yangiladi:\n{diff}")

        return Response(TimetableSlotSerializer(slots, many=True).data)
