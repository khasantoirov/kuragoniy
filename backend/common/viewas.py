"""Dasturchi → Rol: the developer looks at the platform as another role.

    X-View-As-User: role:admin | role:boshliq   — their own account with that role
    X-View-As-User: <user id>                     — a chosen teacher, admin, boshliq,
                                                    kuzatuvchi or school ma'muriyat

Honoured for the developer only (is_dev_superuser), in
common/authentication.py: the request then runs as the viewed account, so
every page shows exactly what that person sees — and it is read-only:
anything that would write is refused before any view runs, and the viewed
account object refuses to be saved. Sign-in/refresh, the heartbeat and the
picker itself (EXEMPT_PREFIXES) keep running as the developer. Pupils are
looked through the older, admin-wide way (common/permissions.py
view_as_pupil), which this doesn't touch.
"""

from rest_framework.exceptions import PermissionDenied

HEADER = 'HTTP_X_VIEW_AS_USER'
MESSAGE = "Ko'rinish rejimi — faqat ko'rish mumkin, hech narsa o'zgartirilmaydi."
EXEMPT_PREFIXES = ('/api/auth/', '/api/accounts/view-as/', '/api/accounts/me/heartbeat/')
ROLE_VIEWS = {'role:admin': 'admin', 'role:boshliq': 'boshliq'}
# whom a developer may look through (pupils: view_as_pupil)
PERSON_ROLES = ('teacher', 'admin', 'boshliq', 'kuzatuvchi', 'maktab')
ROLE_LABELS = {
    'admin': 'Admin', 'boshliq': 'Rahbar', 'teacher': "O'qituvchi",
    'kuzatuvchi': 'Kuzatuvchi', 'maktab': 'Direktor/zavuch',
}


def _refuse_save(*args, **kwargs):
    raise PermissionDenied(MESSAGE, code='view_only')


def resolve(real, key: str):
    """The account `real` (the developer) looks through for `key`; None when
    the key names nobody it may look through."""
    from accounts.models import User

    if not getattr(real, 'is_dev_superuser', False) or not key:
        return None
    key = key.strip()
    if key in ROLE_VIEWS:
        # a fresh copy of their own account — nothing shared with `real`
        viewed = User.objects.filter(pk=real.pk).first()
        if viewed is None:
            return None
        viewed.role = ROLE_VIEWS[key]
        viewed.is_dev_superuser = False
    else:
        viewed = (User.objects.filter(pk=key, is_active=True, role__in=PERSON_ROLES, is_dev_superuser=False)
                  .exclude(pk=real.pk).first())
        if viewed is None:
            return None
    viewed.save = _refuse_save
    viewed.viewed_by = real
    viewed.view_key = key
    return viewed


def label(viewed) -> str:
    """"O'qituvchi — Gulirano Rahmatova", "Admin (o'zingiz)"."""
    role = ROLE_LABELS.get(viewed.role, viewed.role)
    if getattr(viewed, 'view_key', '') in ROLE_VIEWS:
        return f"{role} (o'zingiz)"
    return f'{role} — {viewed.name}'


def viewing(request) -> bool:
    return getattr(request.user, 'viewed_by', None) is not None
