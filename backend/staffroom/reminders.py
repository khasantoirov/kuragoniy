"""Dars eslatmalari — what the bot tells a teacher about their school day
(notification kind `dars`, Telegram by default; Sozlamalar → Bildirishnomalar
turns it off):

  * in the morning (from MORNING_FROM), the day's lessons from the timetable
    — soat, time, school, class and room;
  * in the evening (from EVENING_FROM), the journal classes they taught today
    (timetable hour ↔ journal class, staffroom/services._match_class) that
    have no lesson day in the journal yet.

Only on school days: Monday–Friday inside a chorak (staffroom/calendar.place
— nothing in the holidays). Each message goes once a day per teacher: the
cache (Redis in production) remembers it, so a restarted bot doesn't send it
again. telegrambot/bot/dars_reminders.py runs send_due() every few minutes.
"""

from datetime import datetime, time

from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

from accounts.models import User
from journal.models import ClassDay, JournalClass
from notifications.models import Kind
from notifications.service import notify
from schools.models import AcademicYear
from timetable.models import TimetableSlot

from .calendar import place
from .services import _match_class

MORNING_FROM, MORNING_UNTIL = time(7, 0), time(11, 0)
EVENING_FROM, EVENING_UNTIL = time(18, 0), time(22, 0)
SENT_FOR = 60 * 60 * 36  # long enough to cover the day, gone by the next


def _school_day(day) -> bool:
    return day.weekday() < 5 and place(day)['chorak'] is not None


def _lessons_today(day) -> dict:
    """{teacher id: [slot, …]} — the day's real lessons (not "band"), by soat."""
    out: dict = {}
    slots = (TimetableSlot.objects.filter(day_index=day.weekday(), band=False, teacher__is_active=True)
             .filter(Q(teacher__approved=True) | Q(teacher__role__in=[User.Role.ADMIN, User.Role.BOSHLIQ]))
             .exclude(teacher__role__in=[User.Role.STUDENT, User.Role.KUZATUVCHI, User.Role.MAKTAB])
             .select_related('teacher', 'school').order_by('teacher_id', 'period_index'))
    for s in slots:
        if s.maktab.strip() or s.sinf.strip() or s.xona.strip() or s.time_from:
            out.setdefault(s.teacher_id, []).append(s)
    return out


def _once(kind: str, user_id, day) -> bool:
    """True the first time today for this teacher (then it's remembered)."""
    return cache.add(f'ke:dars:{kind}:{user_id}:{day.isoformat()}', 1, SENT_FOR)


def _hm(t) -> str:
    return t.strftime('%H:%M') if t else ''


def _room(xona: str) -> str:
    x = (xona or '').strip()
    return f'{x}-xona' if x.isdigit() else (f'xona {x}' if x else '')


def _line(s) -> str:
    when = f"{s.period_index}-soat"
    if s.time_from:
        when += f" · {_hm(s.time_from)}{'–' + _hm(s.time_to) if s.time_to else ''}"
    school = (s.school.name if s.school_id else s.maktab).strip()
    cls = s.sinf.strip()
    room = _room(s.xona)
    what = ' · '.join(x for x in (school, f"{cls} ({room})" if cls and room else cls or room) if x)
    return f"{when} — {what}" if what else when


def send_morning(now: datetime | None = None) -> int:
    now = timezone.localtime(now)
    day = now.date()
    if not (MORNING_FROM <= now.time() < MORNING_UNTIL) or not _school_day(day):
        return 0
    sent = 0
    by_teacher = _lessons_today(day)
    teachers = User.objects.in_bulk(list(by_teacher))
    for tid, slots in by_teacher.items():
        if not _once('ertalab', tid, day):
            continue
        n = len(slots)
        title = f"Bugun {n} ta darsingiz bor"
        body = '\n'.join(_line(s) for s in slots)
        notify(teachers[tid], Kind.DARS, title, body, url='/timetable',
               telegram_text=f"☀️ {title}:\n{body}")
        sent += 1
    return sent


def send_evening(now: datetime | None = None) -> int:
    now = timezone.localtime(now)
    day = now.date()
    if not (EVENING_FROM <= now.time() < EVENING_UNTIL) or not _school_day(day):
        return 0
    sent = 0
    year = AcademicYear.current()
    by_teacher = _lessons_today(day)
    teachers = User.objects.in_bulk(list(by_teacher))
    for tid, slots in by_teacher.items():
        classes = list(JournalClass.objects.filter(teacher_id=tid, year=year).select_related('partner_school'))
        if not classes:
            continue
        taught = []
        for s in slots:
            jc = _match_class(classes, s)
            if jc and jc not in taught:
                taught.append(jc)
        filled = set(ClassDay.objects.filter(journal_class__in=taught, date=day).values_list('journal_class_id', flat=True))
        missing = [jc for jc in taught if jc.id not in filled]
        if not missing or not _once('kechqurun', tid, day):
            continue
        names = [f"{jc.name} ({jc.partner_school.name if jc.partner_school_id else jc.school})".replace(' ()', '')
                 for jc in missing]
        title = 'Bugungi darslar jurnalga yozilmagan'
        body = '\n'.join(names) + '\nDavomat va baholarni kiriting.'
        notify(teachers[tid], Kind.DARS, title, body, url=f'/journal?class={missing[0].id}',
               telegram_text=f"📋 {title}:\n" + '\n'.join(names) + '\nDavomat va baholarni kiriting.')
        sent += 1
    return sent


def send_due(now: datetime | None = None) -> int:
    return send_morning(now) + send_evening(now)
