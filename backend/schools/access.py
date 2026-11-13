"""Which schools a viewer may see. Administration (is_oversight) sees all;
a school's ma'muriyat (User.Role.MAKTAB) only the schools they manage
(SchoolManager); everyone else none of this."""


def managed_school_ids(user) -> set[int]:
    if not getattr(user, 'is_school_admin', False):
        return set()
    cached = getattr(user, '_managed_school_ids', None)
    if cached is None:
        from .models import SchoolManager

        cached = set(SchoolManager.objects.filter(user=user).values_list('school_id', flat=True))
        user._managed_school_ids = cached
    return cached


def can_view_school(user, school_id) -> bool:
    if getattr(user, 'is_oversight', False):
        return True
    try:
        return int(school_id) in managed_school_ids(user)
    except (TypeError, ValueError):
        return False
