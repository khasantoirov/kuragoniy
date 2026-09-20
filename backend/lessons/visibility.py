"""Which quarters a given user is allowed to see lessons from.

Extracted from LessonViewSet.get_queryset() so the global search
(search/views.py) enforces exactly the same gate. Two places reading two
copies of this rule is how a locked quarter's lesson titles would
eventually leak through search while the lessons list still hid them.
"""

from .models import QuarterLock

ALL_CHORAKS = (1, 2, 3, 4)


def visible_chorak_set(user):
    """Admins see every quarter. Everyone else sees only the quarters an
    admin has opened — a missing QuarterLock row means chorak 1 is open
    and 2-4 are closed (their behaviour before locks existed)."""
    if user.is_admin:
        return set(ALL_CHORAKS)
    locks = dict(QuarterLock.objects.filter(chorak__in=ALL_CHORAKS).values_list('chorak', 'is_open'))
    return {ch for ch in ALL_CHORAKS if locks.get(ch, ch == 1)}
