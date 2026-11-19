"""Google reCAPTCHA v3 on the public forms (sign-in, sign-up, password
reset, the landing page's "leave your number" form).

The browser asks Google for a token for an action ("login", "phone_start",
...) and sends it as `captcha`; here Google says how human the visitor
looked (a score 0.0-1.0). Off until RECAPTCHA_SECRET_KEY is set in .env —
the forms then work without it. If Google can't be reached the check lets
the request through (the throttles still apply) rather than lock everyone
out."""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'
FAILED = "Xavfsizlik tekshiruvidan o'tilmadi. Sahifani yangilab, qayta urinib ko'ring."


def captcha_enabled() -> bool:
    return bool(getattr(settings, 'RECAPTCHA_SECRET_KEY', ''))


def captcha_ok(request, action: str) -> bool:
    if not captcha_enabled():
        return True
    token = str(request.data.get('captcha') or '').strip()
    if not token:
        return False
    try:
        r = requests.post(VERIFY_URL, timeout=5, data={
            'secret': settings.RECAPTCHA_SECRET_KEY,
            'response': token,
            'remoteip': request.META.get('REMOTE_ADDR', ''),
        })
        data = r.json()
    except Exception:
        logger.warning('reCAPTCHA unreachable — letting %s through', action)
        return True
    if not data.get('success'):
        return False
    if data.get('action') and data['action'] != action:
        return False
    return float(data.get('score', 0)) >= float(getattr(settings, 'RECAPTCHA_MIN_SCORE', 0.5))
