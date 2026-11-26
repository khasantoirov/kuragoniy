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
# an admin account (User.is_panel_account) is the panel's only
PANEL_ONLY = ("Bu admin akkaunt — u faqat admin.kuragoniy.uz orqali kiradi. "
              "Dars berish uchun o'z kundalik akkauntingiz bilan kiring.")
PANEL_NO_PHONE = ("Admin akkaunt telefon kodi bilan kirmaydi — login, parol va "
                  "Authenticator kodi bilan kiring.")


def is_admin_host(request) -> bool:
    try:
        host = request.get_host()
    except DisallowedHost:
        return False
    return host.split(':')[0].lower() in settings.ADMIN_HOSTS


def may_use_admin_panel(user) -> bool:
    return bool(user and user.is_active and (user.is_dev_superuser or user.role == 'admin'))


def refusal_reason(request, user, *, phone=False):
    """(detail, code) when this person may not have a session at the
    address the request came to; None when they may:
    - the admin address: Admins and the developer only;
    - kuragoniy.uz: everyone but an admin account (it is the panel's);
    - an admin account never signs in with a phone code."""
    if is_admin_host(request):
        if not may_use_admin_panel(user):
            return NOT_ADMIN, 'not_admin'
    elif getattr(user, 'is_panel_account', False):
        return PANEL_ONLY, 'panel_account'
    if phone and getattr(user, 'is_panel_account', False):
        return PANEL_NO_PHONE, 'panel_no_phone'
    return None


def refusal(request, user, *, phone=False):
    """A 403 for someone who may not sign in at this address (see
    refusal_reason); None otherwise."""
    why = refusal_reason(request, user, phone=phone)
    if why:
        return Response({'detail': why[0], 'code': why[1]}, status=status.HTTP_403_FORBIDDEN)
    return None
