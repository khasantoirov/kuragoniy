"""Small security helpers shared by the auth views, the role-aware JWT
authentication class and the student/teacher account tools."""

import ipaddress
import logging
import secrets

from django.utils import timezone

logger = logging.getLogger(__name__)

# No look-alike characters (0/o, 1/l/i) — these passwords are read off a
# printed sheet by children.
_PW_LETTERS = 'abcdefghjkmnpqrstuvwxyz'
_PW_DIGITS = '23456789'


def generate_readable_password() -> str:
    """'k7mp-4qtr' style: 8 random characters (~41 bits) in two groups,
    always mixing letters and digits so it passes Django's
    NumericPasswordValidator/CommonPasswordValidator."""
    alphabet = _PW_LETTERS + _PW_DIGITS
    while True:
        raw = ''.join(secrets.choice(alphabet) for _ in range(8))
        if any(c in _PW_DIGITS for c in raw) and any(c in _PW_LETTERS for c in raw):
            return f'{raw[:4]}-{raw[4:]}'


def client_ip(request) -> str | None:
    """nginx sets X-Real-IP to the real peer address (deploy/nginx); daphne
    only listens on 127.0.0.1, so that header can't be forged from
    outside. Validated so a malformed value never reaches a
    GenericIPAddressField."""
    if request is None:
        return None
    raw = request.META.get('HTTP_X_REAL_IP') or request.META.get('REMOTE_ADDR') or ''
    try:
        return str(ipaddress.ip_address(raw.strip()))
    except ValueError:
        return None


def user_agent(request) -> str:
    if request is None:
        return ''
    return (request.META.get('HTTP_USER_AGENT') or '')[:255]


def log_event(action: str, *, actor=None, request=None, detail: str = '') -> None:
    """Writes one AuditLog row. Never raises — an audit write failing must
    not turn a successful login/reset into a 500."""
    from common.models import AuditLog

    try:
        label = ''
        if actor is not None and getattr(actor, 'pk', None):
            label = f'{actor.name} ({actor.login_name})'[:200]
        AuditLog.objects.create(
            actor=actor if (actor is not None and getattr(actor, 'pk', None)) else None,
            actor_label=label,
            action=action[:64],
            detail=detail[:4000],
            ip=client_ip(request),
            user_agent=user_agent(request),
        )
    except Exception:
        logger.exception('Failed to write audit log entry')


def revoke_all_tokens(user) -> None:
    """Invalidates every session of `user`: blacklists all outstanding
    refresh tokens and moves tokens_valid_after forward, which
    common/authentication.py checks against each access token's `iat`."""
    from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

    user.tokens_valid_after = timezone.now()
    user.save(update_fields=['tokens_valid_after'])
    outstanding = OutstandingToken.objects.filter(user=user).exclude(blacklistedtoken__isnull=False)
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=t) for t in outstanding], ignore_conflicts=True,
    )
    from accounts.sessions import revoke_all_sessions

    revoke_all_sessions(user)


def token_predates_revocation(user, iat) -> bool:
    valid_after = getattr(user, 'tokens_valid_after', None)
    if not valid_after or iat is None:
        return False
    try:
        return int(iat) < int(valid_after.timestamp())
    except (TypeError, ValueError):
        return True
