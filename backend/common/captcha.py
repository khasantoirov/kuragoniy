"""Google reCAPTCHA v3 on the public forms (sign-in, sign-up, password
reset, the landing page's "leave your number" form).

The browser asks Google for a token for an action ("login", "phone_start",
...) and sends it as `captcha`; here Google says how human the visitor
looked (a score 0.0-1.0).

  * Off until RECAPTCHA_SECRET_KEY is set in .env — the forms then work
    without it.
  * RECAPTCHA_ENFORCE=0 is the trial run: every check is made and written
    to the log, but nobody is turned away — to see real visitors' results
    (and that the two keys belong together) before switching it on.
  * Never a lock-out by our own mistake: if Google can't be reached, or
    says the secret key itself is wrong, the request goes through (the
    throttles still apply) and the log says why.
"""

import logging

import requests
from django.conf import settings

from .security import client_ip

logger = logging.getLogger(__name__)

VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
FAILED = "Xavfsizlik tekshiruvidan o'tilmadi. Sahifani yangilab, qayta urinib ko'ring."
# Google's answers that mean *our* setup is wrong, not the visitor
CONFIG_ERRORS = {'missing-input-secret', 'invalid-input-secret', 'bad-request'}


def captcha_enabled() -> bool:
    return bool(getattr(settings, 'RECAPTCHA_SECRET_KEY', ''))


def captcha_enforced() -> bool:
    return bool(getattr(settings, 'RECAPTCHA_ENFORCE', True))


def _judge(request, action: str) -> tuple[str, str]:
    """('pass' | 'fail' | 'open', what Google said) — 'open' lets the
    request through because of a problem on our side."""
    token = str(request.data.get('captcha') or '').strip()
    if not token:
        return 'fail', 'no token'
    try:
        r = requests.post(VERIFY_URL, timeout=5, data={
            'secret': settings.RECAPTCHA_SECRET_KEY,
            'response': token,
            'remoteip': client_ip(request) or '',
        })
        data = r.json()
    except Exception as exc:
        return 'open', f'unreachable ({exc.__class__.__name__})'
    errors = set(data.get('error-codes') or [])
    said = (f"success={data.get('success')} score={data.get('score')} action={data.get('action')} "
            f"host={data.get('hostname')} errors={sorted(errors)}")
    if errors & CONFIG_ERRORS:
        logger.error('reCAPTCHA secret key rejected by Google — check RECAPTCHA_SECRET_KEY: %s', said)
        return 'open', said
    if not data.get('success'):
        return 'fail', said
    if data.get('action') and data['action'] != action:
        return 'fail', said
    if float(data.get('score', 0)) < float(getattr(settings, 'RECAPTCHA_MIN_SCORE', 0.5)):
        return 'fail', said
    return 'pass', said


def captcha_ok(request, action: str) -> bool:
    if not captcha_enabled():
        return True
    verdict, said = _judge(request, action)
    if not captcha_enforced():
        # the trial run: written down, never refused
        logger.warning('reCAPTCHA trial %s → %s (%s)', action, verdict, said)
        return True
    if verdict != 'pass':
        logger.warning('reCAPTCHA %s → %s (%s)', action, verdict, said)
    return verdict != 'fail'
