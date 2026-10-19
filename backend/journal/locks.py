"""Which journal days a user may still change.

A teacher marks attendance and grades on the lesson day itself; from the
next day on that day is closed. Changing it then needs an administrator's
permission (JournalEditGrant) — asked for from the journal, or given
directly from Jurnal → Ruxsatlar. Administrators are never locked out.
"Today" is the school's local date (TIME_ZONE = Asia/Tashkent)."""

from django.db.models import Q
from django.utils import timezone

from .models import JournalEditGrant

LOCKED_DETAIL = (
    "Bu kunning baho va davomati yopilgan: ular faqat dars kunining o'zida kiritiladi. "
    "O'zgartirish uchun administratordan ruxsat so'rang."
)


def today():
    return timezone.localdate()


def active_grants(user, journal_class=None):
    qs = JournalEditGrant.objects.filter(
        teacher=user, status=JournalEditGrant.Status.APPROVED, expires_at__gt=timezone.now(),
    )
    if journal_class is not None:
        qs = qs.filter(Q(journal_class=journal_class) | Q(journal_class__isnull=True))
    return qs


def can_edit_day(user, journal_class, day) -> bool:
    if user.is_admin or day == today():
        return True
    return active_grants(user, journal_class).filter(date_from__lte=day, date_to__gte=day).exists()


def lock_info(user, journal_class) -> dict:
    """What the grid needs to grey out closed days and show open ones."""
    pending = JournalEditGrant.objects.filter(
        teacher=user, status=JournalEditGrant.Status.PENDING,
    ).filter(Q(journal_class=journal_class) | Q(journal_class__isnull=True))
    return {
        'today': today().isoformat(),
        'free': bool(user.is_admin),
        'grants': [
            {'id': g.id, 'date_from': g.date_from, 'date_to': g.date_to, 'expires_at': g.expires_at}
            for g in active_grants(user, journal_class)
        ],
        'pending': [{'id': g.id, 'date_from': g.date_from, 'date_to': g.date_to} for g in pending],
    }
