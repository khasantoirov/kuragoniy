"""Which journal days may still be changed, and by whom.

Attendance and marks go in on the lesson day itself. From the next day
on that day is closed for everyone — administrators included, in their
own classes — until an administrator opens it (JournalEditGrant): from
Jurnal → Ruxsatlar, from the lock on the day in the teacher's journal,
or by approving the teacher's request. Only a journal's own teacher
writes to it; an administrator viewing someone else's journal sees it
read-only. "Today" is the school's local date (TIME_ZONE = Asia/Tashkent).

A past o'quv yili's journal is read-only as a whole: no "today" there, no
roster or class changes; its days, and its quarter grades, open only
while an administrator's permission covers them."""

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from .models import JournalEditGrant

LOCKED_DETAIL = (
    "Bu kunning baho va davomati yopilgan: ular faqat dars kunining o'zida kiritiladi. "
    "O'zgartirish uchun administratordan ruxsat so'rang."
)
NOT_OWNER_DETAIL = "Bu jurnalni faqat uning o'qituvchisi to'ldiradi."
PAST_YEAR_DETAIL = (
    "Bu o'tgan o'quv yilining jurnali — faqat ko'rish mumkin. "
    "O'zgartirish kerak bo'lsa, ma'muriyatdan ruxsat so'rang."
)
# "Ruxsat berish" on a teacher's row opens every past day of this school
# year (well, the last 400 days) — the simple "let them fix things" switch.
ALL_PAST_DAYS = timedelta(days=400)


def today():
    return timezone.localdate()


def active_grants(user, journal_class=None):
    qs = JournalEditGrant.objects.filter(
        teacher=user, status=JournalEditGrant.Status.APPROVED, expires_at__gt=timezone.now(),
    )
    if journal_class is not None:
        qs = qs.filter(Q(journal_class=journal_class) | Q(journal_class__isnull=True))
    return qs


def is_owner(user, journal_class) -> bool:
    return journal_class.teacher_id == user.pk


def is_past_year(journal_class) -> bool:
    return bool(journal_class.year_id) and journal_class.year.is_past()


def past_year_open(user, journal_class) -> bool:
    """A past year's journal takes a quarter grade only while an
    administrator's permission for it is open."""
    return is_owner(user, journal_class) and active_grants(user, journal_class).exists()


def can_edit_day(user, journal_class, day) -> bool:
    if not is_owner(user, journal_class):
        return False
    if day == today() and not is_past_year(journal_class):
        return True
    return active_grants(user, journal_class).filter(date_from__lte=day, date_to__gte=day).exists()


def lock_info(viewer, journal_class) -> dict:
    """What the grid needs: the journal owner's open days and requests,
    whether the viewer writes here, and whether they may open days."""
    teacher = journal_class.teacher
    pending = JournalEditGrant.objects.filter(
        teacher=teacher, status=JournalEditGrant.Status.PENDING,
    ).filter(Q(journal_class=journal_class) | Q(journal_class__isnull=True))
    return {
        'today': today().isoformat(),
        'owner': is_owner(viewer, journal_class),
        'past_year': is_past_year(journal_class),
        'can_grant': bool(viewer.is_admin),
        # Nazorat ishi: administrators grade it in any journal.
        'can_control': bool(viewer.is_admin),
        'teacher': teacher.pk,
        'teacher_name': teacher.name,
        'grants': [
            {'id': g.id, 'date_from': g.date_from, 'date_to': g.date_to, 'expires_at': g.expires_at}
            for g in active_grants(teacher, journal_class)
        ],
        'pending': [
            {'id': g.id, 'date_from': g.date_from, 'date_to': g.date_to, 'reason': g.reason} for g in pending
        ],
    }
