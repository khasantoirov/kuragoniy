"""Colleagues' birthdays as inbox messages — today and three days ahead.

Generated lazily the first time a staff member's app asks for its inbox
on a given day (no scheduler needed); the dedupe key keeps it to one
message per colleague per occasion.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.utils import timezone

from .models import Kind, Notification
from .service import notify

AHEAD_DAYS = (0, 3)


def _same_day(bday, day) -> bool:
    if bday.month == day.month and bday.day == day.day:
        return True
    # 29-fevral non-leap years: celebrate on the 28th.
    return bday.month == 2 and bday.day == 29 and day.month == 2 and day.day == 28 and not _leap(day.year)


def _leap(year) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)


def ensure_birthday_notices(user) -> None:
    if not getattr(user, 'is_staff_member', False):
        return
    today = timezone.localdate()
    flag = f'bday-gen:{user.id}:{today.isoformat()}'
    if cache.get(flag):
        return
    cache.set(flag, 1, 60 * 60 * 6)

    User = get_user_model()
    colleagues = list(
        User.objects.filter(is_active=True, bday__isnull=False)
        .exclude(role=User.Role.STUDENT)
        .only('id', 'name', 'bday', 'approved', 'role')
    )
    wanted = []
    for days in AHEAD_DAYS:
        day = today + timedelta(days=days)
        for c in colleagues:
            if not _same_day(c.bday, day):
                continue
            own = c.id == user.id
            if own and days:
                continue
            key = f'bday:{c.id}:{day.isoformat()}:{days}'
            if own:
                title, body = "Tug'ilgan kuningiz muborak!", "Jamoa nomidan sizni tavallud ayyomingiz bilan tabriklaymiz."
            elif days == 0:
                title, body = f"{c.name} — tug'ilgan kun", f"Bugun {c.name}ning tug'ilgan kuni."
            else:
                title, body = f"{c.name} — tug'ilgan kun", f"{c.name}ning tug'ilgan kuniga {days} kun qoldi."
            wanted.append((key, title, body, {'name': c.name, 'days': days, 'self': own}))
    if not wanted:
        return
    existing = set(
        Notification.objects.filter(user=user, dedupe_key__in=[w[0] for w in wanted]).values_list('dedupe_key', flat=True)
    )
    for key, title, body, data in wanted:
        if key not in existing:
            notify(user, Kind.TUGILGAN, title, body, '/notifications', data=data, dedupe_key=key)
