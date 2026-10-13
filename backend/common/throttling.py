"""Per-IP rate limits for unauthenticated auth endpoints — nothing in
DEFAULT_THROTTLE_CLASSES covered login/register before, so a script could
retry passwords or spam registrations without limit. Scoped throttles
(rather than a blanket AnonRateThrottle) so tightening login attempts
doesn't also cap unrelated anonymous traffic (e.g. the VAPID public key
endpoint).

Login is deliberately not very tight per IP: a whole class logs in at
once from behind one school NAT address. Per-account lockout
(accounts/views.py LoginView) is what actually stops password guessing
against a single account."""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'


class StudentRegisterRateThrottle(AnonRateThrottle):
    scope = 'student_register'


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = 'password_reset'


class PasswordResetConfirmRateThrottle(AnonRateThrottle):
    scope = 'password_reset_confirm'


class GameAnswerRateThrottle(UserRateThrottle):
    scope = 'game_answer'
