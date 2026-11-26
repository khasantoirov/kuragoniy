"""The public forms' bot check — our own, in place of Google reCAPTCHA
(removed 2026-11-22: Google kept rejecting its tokens, and it loaded a
third-party script on the sign-in pages). Two invisible parts:

  * a bot trap: a hidden field (HONEYPOT) no person sees or fills — a
    script that fills every input fills it too;
  * a small proof of work: GET /api/auth/guard/?a=<action> hands out a
    signed challenge; the browser finds a `nonce` such that
    sha256(salt + nonce) starts with `bits` zero bits (~65 000 tries at 16
    bits: a fraction of a second, done while the person is still typing)
    and sends {guard: {token, nonce}} with the form. One request costs a
    script that much work, every challenge works once, and only for its
    own form.

FORM_GUARD_ENFORCE=0 in .env is the emergency switch: everything is still
checked and logged, nobody is refused. The throttles, the per-account
lock-out and the IP password-spraying block (common/loginguard.py) stay on
either way.
"""

import hashlib
import logging
import math
import secrets
import time

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .throttling import GuardRateThrottle

logger = logging.getLogger(__name__)

SALT = 'common.formguard'
HONEYPOT = 'ke_hp'
FAILED = "Xavfsizlik tekshiruvidan o'tilmadi. Sahifani yangilab, qayta urinib ko'ring."
ACTIONS = {'login', 'phone_start', 'password_reset', 'lead', 'student_register'}


def _bits() -> int:
    return int(getattr(settings, 'FORM_GUARD_BITS', 16))


def _ttl() -> int:
    return int(getattr(settings, 'FORM_GUARD_TTL_SECONDS', 900))


def issue(action: str) -> dict:
    salt = secrets.token_hex(12)
    bits = _bits()
    token = signing.dumps({'a': action, 's': salt, 'b': bits, 't': math.floor(time.time() * 1000) / 1000}, salt=SALT)
    return {'token': token, 'salt': salt, 'bits': bits, 'ttl': _ttl()}


def leading_zero_bits(digest: bytes) -> int:
    n = 0
    for byte in digest:
        if byte == 0:
            n += 8
            continue
        return n + 8 - byte.bit_length()
    return n


def solved(salt: str, nonce, bits: int) -> bool:
    try:
        nonce = int(nonce)
    except (TypeError, ValueError):
        return False
    if nonce < 0 or nonce > 10**12:
        return False
    return leading_zero_bits(hashlib.sha256(f'{salt}{nonce}'.encode()).digest()) >= bits


def check(request, action: str) -> tuple[bool, str]:
    """(passed, why not) — `why` goes to the log only."""
    data = request.data if hasattr(request, 'data') else {}
    if str(data.get(HONEYPOT) or '').strip():
        return False, 'bot trap filled'
    proof = data.get('guard')
    if not isinstance(proof, dict) or not proof.get('token'):
        return False, 'no proof'
    try:
        c = signing.loads(str(proof['token']), salt=SALT, max_age=_ttl())
    except signing.SignatureExpired:
        return False, 'expired'
    except signing.BadSignature:
        return False, 'bad token'
    if c.get('a') != action:
        return False, f"for another form ({c.get('a')})"
    if time.time() - float(c.get('t', 0)) < float(getattr(settings, 'FORM_GUARD_MIN_SECONDS', 1)):
        return False, 'too fast'
    if not solved(c.get('s', ''), proof.get('nonce'), int(c.get('b', _bits()))):
        return False, 'not solved'
    # every challenge works once
    if not cache.add(f"ke:guard:{c['s']}", 1, _ttl() + 60):
        return False, 'used twice'
    return True, ''


def guard_ok(request, action: str) -> bool:
    if not getattr(settings, 'FORM_GUARD_ENABLED', True):
        return True
    passed, why = check(request, action)
    if passed:
        return True
    from .security import client_ip

    enforced = getattr(settings, 'FORM_GUARD_ENFORCE', True)
    logger.warning('Form guard %s %s → %s (IP %s)', action, 'refused' if enforced else 'would refuse (trial)',
                   why, client_ip(request) or '?')
    return not enforced


class GuardChallengeView(APIView):
    """GET ?a=<action> — a fresh challenge for one public form."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [GuardRateThrottle]

    def get(self, request):
        action = str(request.query_params.get('a') or '')
        if action not in ACTIONS:
            return Response({'detail': "Noma'lum forma."}, status=400)
        response = Response(issue(action))
        response['Cache-Control'] = 'no-store'
        return response
