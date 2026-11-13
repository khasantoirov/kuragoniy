"""Litsenziyalar: whether a partner school's subscription is in force.

The licence whose dates cover today is the school's current one. Its state:

  none      no licence at all                         — not in force
  future    the only licence starts later             — not in force
  expired   the last licence has ended                — not in force
  ending    in force, ends within ENDING_DAYS         — in force
  trial     in force, the Sinov plan                  — in force
  unpaid    in force, not marked paid yet             — in force
  active    in force and paid                         — in force

Nothing is locked until the administration turns enforcement on
(PlatformSettings.license_enforced): then a school not in force keeps its
journal read-only — marks, attendance and quarter grades can't be entered
(journal/locks.py). Classes not linked to a partner school and past
o'quv yillari aren't affected.

The bot checks every hour (telegrambot/bot/license_reminders.py) and tells
the administration — and the school's own ma'muriyat — REMIND_AT days
before a licence ends, each reminder once.
"""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import AcademicYear, SchoolLicense, SchoolTeacher

ENDING_DAYS = 14
REMIND_AT = (14, 7, 3, 1, 0)
IN_FORCE = ('ending', 'trial', 'unpaid', 'active')
LABELS = {
    'none': "Litsenziya yo'q",
    'future': 'Hali boshlanmagan',
    'expired': 'Muddati tugagan',
    'ending': 'Muddati tugayapti',
    'trial': 'Sinov davri',
    'unpaid': "To'lanmagan",
    'active': 'Faol',
}
LOCK_DETAIL = ("«{school}» maktabining litsenziyasi amalda emas ({state}) — jurnal faqat ko'rish rejimida. "
               "Litsenziyani uzaytirish uchun ma'muriyatga murojaat qiling.")


def today():
    return timezone.localdate()


def current(school, day=None):
    """The licence in force on `day`, else the nearest one (a coming one
    before a past one)."""
    day = day or today()
    licences = list(SchoolLicense.objects.filter(school=school))
    covering = [x for x in licences if x.starts_on <= day <= x.ends_on]
    if covering:
        return max(covering, key=lambda x: (x.ends_on, x.id))
    coming = [x for x in licences if x.starts_on > day]
    if coming:
        return min(coming, key=lambda x: x.starts_on)
    return max(licences, key=lambda x: (x.ends_on, x.id)) if licences else None


def state_of(licence, day=None) -> str:
    day = day or today()
    if licence is None:
        return 'none'
    if licence.starts_on > day:
        return 'future'
    if licence.ends_on < day:
        return 'expired'
    if (licence.ends_on - day).days < ENDING_DAYS:
        return 'ending'
    if licence.plan == SchoolLicense.Plan.SINOV:
        return 'trial'
    return 'active' if licence.paid else 'unpaid'


def usage(school, year=None) -> dict:
    """Seats taken: teachers assigned to the school, pupils on this o'quv
    yili's rosters there."""
    from journal.models import Student

    year = year or AcademicYear.current()
    return {
        'teachers': SchoolTeacher.objects.filter(school=school).count(),
        'pupils': Student.objects.filter(active=True, journal_class__partner_school=school,
                                         journal_class__year=year).count(),
    }


def licence_dict(licence) -> dict | None:
    if licence is None:
        return None
    return {
        'id': licence.id, 'plan': licence.plan, 'plan_label': licence.get_plan_display(),
        'starts_on': licence.starts_on, 'ends_on': licence.ends_on,
        'teacher_seats': licence.teacher_seats, 'pupil_seats': licence.pupil_seats,
        'amount': licence.amount, 'paid': licence.paid, 'paid_on': licence.paid_on, 'note': licence.note,
    }


def status(school, day=None) -> dict:
    day = day or today()
    licence = current(school, day)
    state = state_of(licence, day)
    return {
        'state': state, 'label': LABELS[state], 'in_force': state in IN_FORCE,
        'days_left': (licence.ends_on - day).days if licence and state in IN_FORCE else None,
        'licence': licence_dict(licence),
    }


def enforced() -> bool:
    from common.models import PlatformSettings

    return PlatformSettings.get().license_enforced


def licence_lock(journal_class) -> str | None:
    """Why this journal is read-only for want of a licence, or None."""
    school = journal_class.partner_school if journal_class.partner_school_id else None
    if school is None or (journal_class.year_id and journal_class.year.is_past()):
        return None
    if not enforced():
        return None
    st = status(school)
    if st['in_force']:
        return None
    return LOCK_DETAIL.format(school=school.name, state=st['label'].lower())


def send_reminders(day=None) -> int:
    """Tells the administration (and the school's ma'muriyat) when a
    licence in force is REMIND_AT days from its end. Returns how many."""
    from accounts.models import User
    from notifications.models import Kind as NotifyKind
    from notifications.service import notify

    day = day or today()
    horizon = day + timedelta(days=max(REMIND_AT))
    sent = 0
    for licence in SchoolLicense.objects.select_related('school').filter(starts_on__lte=day, ends_on__gte=day,
                                                                        ends_on__lte=horizon):
        left = (licence.ends_on - day).days
        due = [d for d in REMIND_AT if left <= d and d not in (licence.reminded or [])]
        if not due:
            continue
        mark = min(due)
        admins = [u for u in User.objects.filter(is_active=True).filter(Q(is_dev_superuser=True) | Q(role__in=[
            User.Role.ADMIN, User.Role.BOSHLIQ]))]
        managers = list(User.objects.filter(is_active=True, school_manager_roles__school=licence.school))
        when = "bugun tugaydi" if left == 0 else f"{left} kundan keyin tugaydi"
        notify(admins + [m for m in managers if m not in admins], NotifyKind.TIZIM,
               f"«{licence.school.name}» litsenziyasi {when}",
               f"{licence.get_plan_display()} · {licence.starts_on:%d.%m.%Y}–{licence.ends_on:%d.%m.%Y}",
               f'/manage/schools/{licence.school_id}', channels=('app', 'telegram'),
               dedupe_key=f'licence:{licence.id}:{mark}')
        licence.reminded = sorted({*(licence.reminded or []), *due})
        licence.save(update_fields=['reminded'])
        sent += 1
    return sent
