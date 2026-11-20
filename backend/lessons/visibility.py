"""Which lessons a given user is allowed to see: the quarters an admin has
opened — per fan, each fan opens its own — and the person's own fan(s).

Extracted from LessonViewSet.get_queryset() so the global search
(search/views.py), kits and the teacher's day plan enforce exactly the same
gate. Two places reading two copies of this rule is how a locked quarter's
lesson titles would eventually leak through search while the lessons list
still hid them.
"""

from django.db.models import Q

from common.subjects import GRADES, STEAM, subjects_for

from .models import QuarterLock

ALL_CHORAKS = (1, 2, 3, 4)


def open_quarters(subject: str = STEAM) -> set[int]:
    """The quarters a fan has opened to teachers — a missing QuarterLock row
    means chorak 1 is open and 2-4 are closed (their behaviour before locks
    existed)."""
    locks = dict(QuarterLock.objects.filter(subject=subject, chorak__in=ALL_CHORAKS).values_list('chorak', 'is_open'))
    return {ch for ch in ALL_CHORAKS if locks.get(ch, ch == 1)}


def visible_chorak_set(user, subject: str = STEAM):
    """Admins see every quarter; everyone else the ones `subject` opened."""
    if user.is_admin:
        return set(ALL_CHORAKS)
    return open_quarters(subject)


def visible_lessons(qs, user, fan=None):
    """`qs` narrowed to what this person may see: their own fan(s) — only
    `fan` when a window is given (common/subjects.window) — each within the
    quarters that fan has opened (the administration: every quarter). Used
    by the lessons list, the global search, kits and the teacher's day
    plan."""
    subjects = subjects_for(user)
    if fan in subjects:
        subjects = [fan]
    if user.is_admin:
        return qs.filter(grade__in=[g for s in subjects for g in GRADES[s]])
    allowed = Q(pk__in=[])
    for s in subjects:
        allowed |= Q(grade__in=GRADES[s], chorak__in=open_quarters(s))
    return qs.filter(allowed)
