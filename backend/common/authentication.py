"""JWT authentication + a central, role-based portal gate.

Every DRF view authenticates through this class (DEFAULT_AUTHENTICATION_
CLASSES), so the checks below apply even to an endpoint whose own
permission_classes forgot about a role — a second line of defence behind
the per-view permissions in common/permissions.py:

  * revoked sessions: any token issued before user.tokens_valid_after
    (password change/reset, block, "log out everywhere") is refused;
  * students: only the student-portal prefixes are reachable at all;
  * Kuzatuvchi (observer): read-only everywhere except their own profile;
  * must_change_password: nothing but the profile/password endpoints until
    the generated password has been replaced.
"""

from rest_framework.exceptions import AuthenticationFailed, PermissionDenied
from rest_framework.permissions import SAFE_METHODS
from rest_framework_simplejwt.authentication import JWTAuthentication

from .security import token_predates_revocation

STUDENT_ALLOWED_PREFIXES = (
    '/api/auth/',
    '/api/accounts/me/',
    '/api/student/',
    '/api/games/play/',
    '/api/games/mini/',
    '/api/push/',
)
SELF_SERVICE_PREFIXES = ('/api/auth/', '/api/accounts/me/', '/api/push/')
PASSWORD_CHANGE_PREFIXES = ('/api/auth/', '/api/accounts/me/')


def enforce_portal(user, path: str, method: str) -> None:
    if getattr(user, 'must_change_password', False) and not path.startswith(PASSWORD_CHANGE_PREFIXES):
        raise PermissionDenied("Avval vaqtinchalik parolni o'zgartiring.", code='password_change_required')
    if getattr(user, 'is_student', False) and not path.startswith(STUDENT_ALLOWED_PREFIXES):
        raise PermissionDenied("Bu bo'lim o'quvchilar uchun emas.", code='wrong_portal')
    if (
        getattr(user, 'is_observer', False)
        and method not in SAFE_METHODS
        and not path.startswith(SELF_SERVICE_PREFIXES)
    ):
        raise PermissionDenied("Kuzatuvchi faqat ko'ra oladi.", code='read_only_role')


class RoleAwareJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if token_predates_revocation(user, validated_token.get('iat')):
            raise AuthenticationFailed("Sessiya bekor qilingan, qaytadan kiring.", code='token_revoked')
        return user

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user, _token = result
        enforce_portal(user, request.path, request.method)
        return result
