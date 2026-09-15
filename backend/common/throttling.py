"""Per-IP rate limits for unauthenticated auth endpoints — nothing in
DEFAULT_THROTTLE_CLASSES covered login/register before, so a script could
retry passwords or spam registrations without limit. Scoped throttles
(rather than a blanket AnonRateThrottle) so tightening login attempts
doesn't also cap unrelated anonymous traffic (e.g. the VAPID public key
endpoint)."""

from rest_framework.throttling import AnonRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'
