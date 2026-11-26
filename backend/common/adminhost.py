"""admin.kuragoniy.uz — the administration's own panel (the owner's choice,
2026-11-26: "admin uchun alohida admin.kuragoniy.uz sub domen").

The same backend answers both addresses. What differs is who may sign in:
at the admin address only an Admin or the developer. Everyone else (the
boshliq, kuzatuvchi, school ma'muriyat, teachers, pupils) is refused there
and keeps using kuragoniy.uz. The browser keeps a separate session per
address (the refresh cookie is host-only), so signing in on kuragoniy.uz
never opens the panel by itself.

The check runs at every way into a session: the password step, the
two-step code and each refresh. Someone demoted after signing in is
therefore out of the panel at their next refresh."""

from django.conf import settings
from django.core.exceptions import DisallowedHost
from rest_framework import status
from rest_framework.response import Response

NOT_ADMIN = ("Boshqaruv paneliga faqat administratorlar kiradi. "
             "Platformaga kuragoniy.uz orqali kiring.")


def is_admin_host(request) -> bool:
    try:
        host = request.get_host()
    except DisallowedHost:
        return False
    return host.split(':')[0].lower() in settings.ADMIN_HOSTS


def may_use_admin_panel(user) -> bool:
    return bool(user and user.is_active and (user.is_dev_superuser or user.role == 'admin'))


def refusal(request, user):
    """A 403 for someone who may not use the panel, when the request came
    to the admin address; None otherwise."""
    if is_admin_host(request) and not may_use_admin_panel(user):
        return Response({'detail': NOT_ADMIN, 'code': 'not_admin'}, status=status.HTTP_403_FORBIDDEN)
    return None
