"""Maktabning dars vaqtlari — each partner school's bell schedule
(models.SchoolBells), and how the timetable follows it:

  * a teacher who works at a school (has a lesson there in the timetable or
    a journal class there) — or the administration — enters its lesson
    times: one table for every school day, and optionally a day of its own
    (Friday runs differently in many schools);
  * saving them sets the times of every lesson at that school, any
    teacher's (apply_to_slots);
  * a lesson saved later at that school takes its times from there too
    (TimetableSlotSerializer.validate → lesson_times), so nobody types them
    by hand.
"""

import re
from datetime import time

from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from common.permissions import IsApproved
from common.security import log_event
from schools.models import School

from .models import SchoolBells, TimetableSlot

PERIODS = range(1, 9)
DAY_KEYS = {'*', '0', '1', '2', '3', '4'}
_HM = re.compile(r'^([01]\d|2[0-3]):([0-5]\d)$')


def _t(hm: str) -> time:
    h, m = hm.split(':')
    return time(int(h), int(m))


def lesson_times(bells: SchoolBells | None, day_index: int, period_index: int, span: int = 1):
    """(time_from, time_to) of a lesson from its school's bells — from the
    first period's start to the last one's end — or None if not set."""
    if bells is None:
        return None
    first = bells.period(day_index, period_index)
    if not first:
        return None
    last = bells.period(day_index, period_index + max(1, span or 1) - 1) or first
    return _t(first[0]), _t(last[1])


def clean_times(raw) -> dict:
    """{"*": {"1": ["08:00", "08:45"], …}, "4": {…}} with every time checked;
    empty rows and days dropped."""
    if not isinstance(raw, dict):
        raise ValidationError({'times': "Noto'g'ri ma'lumot."})
    out: dict = {}
    for day, rows in raw.items():
        day = str(day)
        if day not in DAY_KEYS or not isinstance(rows, dict):
            raise ValidationError({'times': f"Noma'lum kun: {day}"})
        clean: dict = {}
        for period, pair in rows.items():
            period = str(period)
            if not period.isdigit() or int(period) not in PERIODS:
                raise ValidationError({'times': f"Noma'lum soat: {period}"})
            if not pair or not any(pair):
                continue
            if not isinstance(pair, (list, tuple)) or len(pair) != 2 or not all(isinstance(x, str) and _HM.match(x) for x in pair):
                raise ValidationError({'times': f"{period}-soat: vaqtni SS:DD ko'rinishida kiriting."})
            if pair[0] >= pair[1]:
                raise ValidationError({'times': f"{period}-soat: tugash vaqti boshlanishidan keyin bo'lsin."})
            clean[period] = [pair[0], pair[1]]
        ordered = sorted(clean.items(), key=lambda kv: int(kv[0]))
        for (p1, a), (p2, b) in zip(ordered, ordered[1:]):
            if b[0] < a[1]:
                raise ValidationError({'times': f"{p2}-soat {p1}-soat tugashidan oldin boshlanib qolgan."})
        if clean:
            out[day] = dict(ordered)
    return out


def apply_to_slots(bells: SchoolBells) -> int:
    """Every lesson at the school takes its times from the bells; how many changed."""
    changed = []
    for slot in TimetableSlot.objects.filter(school_id=bells.school_id, band=False):
        times = lesson_times(bells, slot.day_index, slot.period_index, slot.span)
        if times and (slot.time_from, slot.time_to) != times:
            slot.time_from, slot.time_to = times
            changed.append(slot)
    TimetableSlot.objects.bulk_update(changed, ['time_from', 'time_to'])
    return len(changed)


def can_edit(user, school) -> bool:
    if user.is_admin:
        return True
    from journal.models import JournalClass

    return (TimetableSlot.objects.filter(teacher=user, school=school).exists()
            or JournalClass.objects.filter(teacher=user, partner_school=school).exists())


def _row(bells: SchoolBells | None, school, user) -> dict:
    return {
        'school': school.id,
        'school_name': school.name,
        'times': bells.times if bells else {},
        'updated_by_name': (bells.updated_by.name if bells and bells.updated_by_id else ''),
        'updated_at': bells.updated_at if bells else None,
        'can_edit': can_edit(user, school),
    }


class BellsListView(APIView):
    """GET — the schools whose lesson times are set (everyone may read them)."""

    permission_classes = [permissions.IsAuthenticated, IsApproved]

    def get(self, request):
        rows = SchoolBells.objects.select_related('school', 'updated_by')
        return Response([_row(b, b.school, request.user) for b in rows])


class BellsDetailView(APIView):
    """GET / PUT {times} — one school's lesson times. PUT sets the times of
    every lesson at the school."""

    permission_classes = [permissions.IsAuthenticated, IsApproved]

    def get(self, request, school_id):
        school = get_object_or_404(School, pk=school_id)
        return Response(_row(SchoolBells.objects.filter(school=school).first(), school, request.user))

    def put(self, request, school_id):
        school = get_object_or_404(School, pk=school_id)
        if not can_edit(request.user, school):
            raise PermissionDenied("Bu maktabda darsingiz yo'q — dars vaqtlarini shu maktab o'qituvchisi kiritadi.")
        times = clean_times(request.data.get('times'))
        bells, _ = SchoolBells.objects.get_or_create(school=school)
        bells.times = times
        bells.updated_by = request.user
        bells.save()
        n = apply_to_slots(bells)
        log_event('school_bells', actor=request.user, request=request,
                  detail=f'{school.name}: dars vaqtlari saqlandi, {n} ta darsning vaqti yangilandi')
        return Response({**_row(bells, school, request.user), 'updated_slots': n}, status=status.HTTP_200_OK)
