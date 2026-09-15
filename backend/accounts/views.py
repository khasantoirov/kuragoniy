import secrets
import string

import pyotp
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from common.audit import notify_admin_action
from common.permissions import IsAdminOrDevSuperuser, IsApproved, IsDevSuperuser
from common.throttling import LoginRateThrottle, RegisterRateThrottle

from .models import User
from .serializers import AdminUserSerializer, MeSerializer, RegisterSerializer, UserSerializer

REFRESH_COOKIE = settings.JWT_REFRESH_COOKIE_NAME
REFRESH_COOKIE_PATH = settings.JWT_REFRESH_COOKIE_PATH

TOTP_CHALLENGE_SALT = 'accounts.totp-challenge'
TOTP_CHALLENGE_MAX_AGE = 300  # 5 minutes to enter the code after password step


def _make_totp_challenge(user) -> str:
    return signing.TimestampSigner(salt=TOTP_CHALLENGE_SALT).sign(str(user.pk))


def _resolve_totp_challenge(challenge: str):
    """Returns the pending-login user for a still-fresh challenge, or None
    — used instead of just handing out a JWT after the password step so a
    2FA-enabled account can't be logged into with password alone."""
    signer = signing.TimestampSigner(salt=TOTP_CHALLENGE_SALT)
    try:
        user_id = signer.unsign(str(challenge), max_age=TOTP_CHALLENGE_MAX_AGE)
    except signing.BadSignature:
        return None
    return User.objects.filter(pk=user_id, totp_enabled=True).first()


def _issue_tokens_response(user) -> Response:
    refresh = RefreshToken.for_user(user)
    response = Response({'access': str(refresh.access_token), 'user': MeSerializer(user).data})
    _set_refresh_cookie(response, refresh)
    return response


def _set_refresh_cookie(response, refresh_token):
    response.set_cookie(
        REFRESH_COOKIE,
        str(refresh_token),
        max_age=int(refresh_token.lifetime.total_seconds()),
        httponly=True,
        secure=not settings.DEBUG,
        samesite='Lax',
        path=REFRESH_COOKIE_PATH,
    )


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(MeSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.user

        if user.totp_enabled:
            # Correct password alone must not be enough for a 2FA-enabled
            # account — hand back a short-lived challenge instead of
            # tokens; TwoFactorVerifyView issues the real tokens only once
            # a matching TOTP code comes back for it.
            return Response({'totp_required': True, 'challenge': _make_totp_challenge(user)})

        return _issue_tokens_response(user)


class TwoFactorVerifyView(generics.GenericAPIView):
    """Second step of login for a 2FA-enabled account — takes the
    challenge from LoginView plus a 6-digit TOTP code and, if it matches,
    issues the same tokens LoginView would have for a non-2FA account."""

    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        user = _resolve_totp_challenge(request.data.get('challenge', ''))
        if not user:
            return Response({'detail': "Sessiya muddati tugagan, qaytadan kiring."}, status=status.HTTP_401_UNAUTHORIZED)

        code = str(request.data.get('code', ''))
        if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            return Response({'detail': "Kod noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)

        return _issue_tokens_response(user)


class TwoFactorSetupView(generics.GenericAPIView):
    """Starts (or restarts) 2FA enrollment: generates a fresh secret and
    returns it plus an otpauth:// URI for a QR code. Not yet enabled —
    TwoFactorConfirmView flips totp_enabled only once the user proves they
    can generate a matching code, so an abandoned setup never locks
    anyone out or silently turns on 2FA behind their back."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        secret = pyotp.random_base32()
        user.totp_secret = secret
        user.totp_enabled = False
        user.save(update_fields=['totp_secret', 'totp_enabled'])
        uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="KO'RAGONIY EDU")
        return Response({'secret': secret, 'otpauth_url': uri})


class TwoFactorConfirmView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        if not user.totp_secret:
            return Response({'detail': "Avval sozlashni boshlang."}, status=status.HTTP_400_BAD_REQUEST)
        code = str(request.data.get('code', ''))
        if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            return Response({'detail': "Kod noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)

        user.totp_enabled = True
        user.save(update_fields=['totp_enabled'])
        notify_admin_action(user, "Ikki bosqichli tasdiqlashni yoqdi")
        return Response(MeSerializer(user).data)


class TwoFactorDisableView(generics.GenericAPIView):
    """Self-service disable — requires the current password so a hijacked
    but still-logged-in session can't be used to quietly turn 2FA off."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        password = request.data.get('password', '')
        if user.has_usable_password() and not user.check_password(password):
            return Response({'detail': "Parol noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)

        user.totp_secret = ''
        user.totp_enabled = False
        user.save(update_fields=['totp_secret', 'totp_enabled'])
        notify_admin_action(user, "Ikki bosqichli tasdiqlashni o'chirdi")
        return Response(MeSerializer(user).data)


class RefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        refresh_raw = request.COOKIES.get(REFRESH_COOKIE)
        if not refresh_raw:
            return Response({'detail': "Refresh token topilmadi."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = self.get_serializer(data={'refresh': refresh_raw})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            return Response({'detail': "Refresh token yaroqsiz."}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response({'access': serializer.validated_data['access']})
        new_refresh = serializer.validated_data.get('refresh')
        if new_refresh:
            _set_refresh_cookie(response, RefreshToken(new_refresh))
        return response


class LogoutView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        refresh_raw = request.COOKIES.get(REFRESH_COOKIE)
        if refresh_raw:
            try:
                RefreshToken(refresh_raw).blacklist()
            except TokenError:
                pass
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
        return response


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ChangePasswordView(generics.GenericAPIView):
    """Self-service password change for a logged-in user — requires the
    current password (skipped for migrated accounts that still carry an
    unusable password, since there's nothing valid to verify)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        current = request.data.get('current_password', '')
        new = request.data.get('new_password', '')

        if user.has_usable_password() and not user.check_password(current):
            return Response({'detail': "Joriy parol noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new, user=user)
        except DjangoValidationError as exc:
            return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new)
        user.save(update_fields=['password'])
        return Response({'detail': "Parol yangilandi."})


class UserAdminViewSet(viewsets.ReadOnlyModelViewSet):
    """Admin/dev-superuser user management: approve, block, reject
    (delete), promote/demote — mirrors the write branches of
    firestore.rules' users/{uid} rule.
    """

    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_serializer_class(self):
        # Admin-level viewers additionally get telegram_chat_id (shown on
        # the admin panel's staff cards) — a plain teacher hitting this
        # same list/retrieve endpoint stays on the base UserSerializer.
        user = self.request.user
        if user.is_authenticated and user.is_admin:
            return AdminUserSerializer
        return UserSerializer

    def get_permissions(self):
        # Any approved user may list/view colleagues (name/photo/bday —
        # used for the home-page birthday notification and staff lists);
        # promote/demote are dev-superuser only (granting/revoking admin
        # rights); everything else just needs admin/dev-superuser.
        #
        # This override replaces DRF's default get_permissions(), so a
        # per-action @action(permission_classes=[...]) kwarg is silently
        # ignored unless handled here explicitly — promote/demote used to
        # declare IsDevSuperuser that way and it had no effect, letting any
        # plain admin promote/demote other admins.
        if self.action in ('list', 'retrieve'):
            return [IsApproved()]
        if self.action in ('promote', 'demote', 'set_boshliq'):
            return [IsDevSuperuser()]
        return [IsAdminOrDevSuperuser()]

    def _guard_target(self, request, target: User):
        # A plain admin may never touch another admin or the dev superuser
        # — only the dev superuser can (mirrors: "plain admin -> only
        # non-admin target docs").
        if not request.user.is_dev_superuser and target.is_admin:
            raise PermissionDenied("Faqat dasturchi boshqa administratorni boshqara oladi.")

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        target = self.get_object()
        self._guard_target(request, target)
        target.approved = True
        target.save(update_fields=['approved'])
        notify_admin_action(request.user, f"Foydalanuvchini tasdiqladi: {target.name} ({target.email})")
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'])
    def block(self, request, pk=None):
        target = self.get_object()
        self._guard_target(request, target)
        target.approved = False
        target.save(update_fields=['approved'])
        notify_admin_action(request.user, f"Foydalanuvchini bloklashi: {target.name} ({target.email})")
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        target = self.get_object()
        self._guard_target(request, target)
        name, email = target.name, target.email
        target.delete()
        notify_admin_action(request.user, f"Foydalanuvchini rad etdi: {name} ({email})")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def promote(self, request, pk=None):
        target = self.get_object()
        old_role = target.get_role_display()
        target.role = User.Role.ADMIN
        target.approved = True
        target.save(update_fields=['role', 'approved'])
        notify_admin_action(request.user, f"Administrator qildi: {target.name} ({target.email})\n• Roli: {old_role} → {target.get_role_display()}")
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'], url_path='set-boshliq')
    def set_boshliq(self, request, pk=None):
        target = self.get_object()
        old_role = target.get_role_display()
        target.role = User.Role.BOSHLIQ
        target.approved = True
        target.save(update_fields=['role', 'approved'])
        notify_admin_action(request.user, f"Boshliq qildi: {target.name} ({target.email})\n• Roli: {old_role} → {target.get_role_display()}")
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'])
    def demote(self, request, pk=None):
        target = self.get_object()
        old_role = target.get_role_display()
        target.role = User.Role.TEACHER
        target.save(update_fields=['role'])
        notify_admin_action(request.user, f"O'qituvchi darajasiga tushirdi: {target.name} ({target.email})\n• Roli: {old_role} → {target.get_role_display()}")
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """Admin-initiated reset: no working SMTP in production, so instead
        of emailing a reset link, generate a new password server-side and
        hand it back once — the admin relays it to the teacher directly
        (Telegram/phone/in person)."""
        target = self.get_object()
        self._guard_target(request, target)
        alphabet = string.ascii_letters + string.digits
        new_password = ''.join(secrets.choice(alphabet) for _ in range(10))
        target.set_password(new_password)
        target.save(update_fields=['password'])
        notify_admin_action(request.user, f"Parolini tiklab berdi: {target.name} ({target.email})")
        return Response({'password': new_password})

    @action(detail=True, methods=['post'], url_path='disable-2fa')
    def disable_2fa(self, request, pk=None):
        """Recovery path for a teacher who lost their authenticator device
        — mirrors reset_password's "admin does it for you, no working SMTP
        to self-serve through" pattern."""
        target = self.get_object()
        self._guard_target(request, target)
        target.totp_secret = ''
        target.totp_enabled = False
        target.save(update_fields=['totp_secret', 'totp_enabled'])
        notify_admin_action(request.user, f"Ikki bosqichli tasdiqlashini o'chirdi: {target.name} ({target.email})")
        return Response(UserSerializer(target).data)
