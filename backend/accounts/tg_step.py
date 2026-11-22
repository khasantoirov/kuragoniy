"""Rahbarlar uchun Telegram tasdig'i — the second step of a password
sign-in for the administration (admin, boshliq, the developer) on a
browser they haven't confirmed yet.

  * The password is right, the account is a leader's with Telegram linked
    and no authenticator-app 2FA (that already is a second step): LoginView
    sends a 6-digit code through @kuragoniybot and answers
    {telegram_required, challenge} instead of tokens.
  * POST /api/auth/login/telegram/ {challenge, code} signs in and marks the
    browser as known: an httpOnly cookie, signed and tied to the current
    password, so the code isn't asked again there for TRUSTED_DEVICE_DAYS —
    and is asked again everywhere once the password changes.
  * Wrong codes count against the account's lock-out like wrong passwords.
  * Never a lock-out by our own fault: when the code can't be delivered
    (Telegram down, bot blocked), the sign-in goes through and the
    security log says so.
"""

import logging
import os
import secrets

import requests
from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.utils.crypto import constant_time_compare, salted_hmac

logger = logging.getLogger(__name__)

CHALLENGE_SALT = 'accounts.tg-step'
TRUST_SALT = 'accounts.trusted-device'
CODE_TTL = 300
MAX_ATTEMPTS = 5


def _trust_seconds() -> int:
    return int(getattr(settings, 'TRUSTED_DEVICE_DAYS', 60)) * 24 * 3600


def applies(user) -> bool:
    return bool(
        getattr(settings, 'LEADER_TELEGRAM_STEP', True)
        and user.is_admin
        and not user.totp_enabled
        and user.telegram_linked and user.telegram_chat_id
    )


def cookie_name(user) -> str:
    return 'ke_td_' + str(user.pk).replace('-', '')[:40]


def _password_stamp(user) -> str:
    return salted_hmac(TRUST_SALT, user.password or '', algorithm='sha256').hexdigest()[:20]


def trusted(request, user) -> bool:
    raw = request.COOKIES.get(cookie_name(user))
    if not raw:
        return False
    try:
        value = signing.loads(raw, salt=TRUST_SALT, max_age=_trust_seconds())
    except signing.BadSignature:
        return False
    return value.get('u') == str(user.pk) and constant_time_compare(value.get('p', ''), _password_stamp(user))


def trust(response, user) -> None:
    response.set_cookie(
        cookie_name(user),
        signing.dumps({'u': str(user.pk), 'p': _password_stamp(user)}, salt=TRUST_SALT),
        max_age=_trust_seconds(),
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
        path=settings.JWT_REFRESH_COOKIE_PATH,
    )


def _hash(nonce: str, code: str) -> str:
    return salted_hmac('accounts.tg-step-code', f'{nonce}:{code}', algorithm='sha256').hexdigest()


def _send(chat_id, text: str) -> bool:
    """Sent right away, not in the background: only a delivered code may
    hold the sign-in up."""
    token = os.environ.get('BOT_TOKEN')
    if not token or not chat_id:
        return False
    try:
        r = requests.post(f'https://api.telegram.org/bot{token}/sendMessage',
                          json={'chat_id': chat_id, 'text': text, 'disable_web_page_preview': True}, timeout=8)
        return bool(r.ok and r.json().get('ok'))
    except Exception:
        logger.exception('Telegram sign-in code not sent')
        return False


def start(user, remember: bool) -> str | None:
    """Sends a code; the challenge for it, or None if it couldn't be sent."""
    code = f'{secrets.randbelow(10 ** 6):06d}'
    nonce = secrets.token_hex(8)
    text = ("🔐 KO'RAGONIY EDU: kirish kodi\n\n"
            f"{code}\n\n"
            "Hisobingizga yangi qurilma yoki brauzerdan kirilmoqda. Kod 5 daqiqa amal qiladi.\n"
            "Agar bu siz bo'lmasangiz, kodni hech kimga bermang va parolingizni almashtiring.")
    cache.set(f'ke:tgstep:{nonce}', {'u': str(user.pk), 'h': _hash(nonce, code), 'n': 0}, CODE_TTL)
    if not _send(user.telegram_chat_id, text):
        cache.delete(f'ke:tgstep:{nonce}')
        return None
    return signing.dumps({'n': nonce, 'r': int(bool(remember))}, salt=CHALLENGE_SALT)


def verify(challenge: str, code: str):
    """('ok' | 'wrong' | 'expired', user or None, remember)."""
    from .models import User

    try:
        c = signing.loads(str(challenge or ''), salt=CHALLENGE_SALT, max_age=CODE_TTL)
    except signing.BadSignature:
        return 'expired', None, True
    key = f"ke:tgstep:{c.get('n')}"
    state = cache.get(key)
    if not state:
        return 'expired', None, True
    user = User.objects.filter(pk=state['u'], is_active=True).first()
    remember = bool(c.get('r', 1))
    if user is None or state['n'] >= MAX_ATTEMPTS:
        cache.delete(key)
        return 'expired', None, remember
    if not constant_time_compare(_hash(c['n'], str(code or '').strip()), state['h']):
        state['n'] += 1
        cache.set(key, state, CODE_TTL)
        return 'wrong', user, remember
    cache.delete(key)
    return 'ok', user, remember
