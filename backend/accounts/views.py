import secrets
from datetime import timedelta

import pyotp
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db.models import Q
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from common.audit import notify_admin_action, notify_user
from common.models import AuditLog
from common.permissions import IsAdminOrDevSuperuser, IsApproved, IsDevSuperuser
from common.security import (
    client_ip,
    generate_readable_password,
    log_event,
    revoke_all_tokens,
    token_predates_revocation,
)
from common.throttling import (
    LoginRateThrottle,
    PasswordResetConfirmRateThrottle,
    PasswordResetRateThrottle,
    RegisterRateThrottle,
)

from .models import PasswordResetCode, TelegramLinkToken, User
from .serializers import AdminUserSerializer, MeSerializer, RegisterSerializer, UserSerializer

REFRESH_COOKIE = settings.JWT_REFRESH_COOKIE_NAME
REFRESH_COOKIE_PATH = settings.JWT_REFRESH_COOKIE_PATH

TOTP_CHALLENGE_SALT = 'accounts.totp-challenge'
TOTP_CHALLENGE_MAX_AGE = 300  # 5 minutes to enter the code after password step

RESET_CODE_SALT = 'accounts.password-reset-code'
RESET_CODES_PER_DAY = 5
RESET_CODE_COOLDOWN_SECONDS = 60

GENERIC_LOGIN_ERROR = "Login yoki parol noto'g'ri."


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
    return User.objects.filter(pk=user_id, totp_enabled=True, is_active=True).first()


def _issue_tokens_response(user, request=None) -> Response:
    refresh = RefreshToken.for_user(user)
    user.last_login = timezone.now()
    user.last_login_ip = client_ip(request)
    user.failed_login_count = 0
    user.locked_until = None
    user.save(update_fields=['last_login', 'last_login_ip', 'failed_login_count', 'locked_until'])
    log_event('login_ok', actor=user, request=request)
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


def _is_locked(user) -> bool:
    return bool(user.locked_until and user.locked_until > timezone.now())


def _locked_response(user) -> Response:
    minutes = max(1, int((user.locked_until - timezone.now()).total_seconds() // 60) + 1)
    return Response(
        {'detail': f"Juda ko'p noto'g'ri urinish. Hisob vaqtincha bloklandi — {minutes} daqiqadan keyin qayta urining.",
         'locked': True},
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _register_failed_login(user, request, reason='password') -> None:
    """Counts a wrong password/TOTP code against the account and locks it
    for LOGIN_LOCKOUT_MINUTES once LOGIN_LOCKOUT_THRESHOLD is reached — the
    owner is told over Telegram, since a lock means someone else is
    probably guessing."""
    user.failed_login_count += 1
    fields = ['failed_login_count']
    if user.failed_login_count >= settings.LOGIN_LOCKOUT_THRESHOLD:
        user.locked_until = timezone.now() + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        user.failed_login_count = 0
        fields.append('locked_until')
        log_event('login_locked', actor=user, request=request, detail=f'sabab: {reason}')
        notify_user(
            user,
            "⚠️ Amaliy Fizika: hisobingizga bir necha marta noto'g'ri parol bilan kirishga urinildi. "
            f"Hisob {settings.LOGIN_LOCKOUT_MINUTES} daqiqaga bloklandi.\n"
            "Agar bu siz bo'lmasangiz, parolingizni almashtiring.",
        )
    user.save(update_fields=fields)


class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [RegisterRateThrottle]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        log_event('register_teacher', actor=user, request=request)
        return Response(MeSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(generics.GenericAPIView):
    """One login endpoint for every portal: `login` is an email (staff) or
    a username (student). Older cached clients still send `email`, which
    is accepted as the same field."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        login = str(request.data.get('login') or request.data.get('email') or '').strip()
        password = str(request.data.get('password') or '')
        if not login or not password:
            return Response({'detail': GENERIC_LOGIN_ERROR}, status=status.HTTP_400_BAD_REQUEST)

        candidate = User.objects.find_by_login(login)
        if candidate and _is_locked(candidate):
            log_event('login_while_locked', actor=candidate, request=request)
            return _locked_response(candidate)

        user = authenticate(request, email=login, password=password)
        if user is None:
            if candidate:
                _register_failed_login(candidate, request)
                if _is_locked(candidate):
                    return _locked_response(candidate)
            log_event('login_failed', actor=candidate, request=request, detail=f'login: {login[:80]}')
            return Response({'detail': GENERIC_LOGIN_ERROR}, status=status.HTTP_401_UNAUTHORIZED)

        if user.totp_enabled:
            # Correct password alone must not be enough for a 2FA-enabled
            # account — hand back a short-lived challenge instead of
            # tokens; TwoFactorVerifyView issues the real tokens only once
            # a matching TOTP code comes back for it.
            return Response({'totp_required': True, 'challenge': _make_totp_challenge(user)})

        return _issue_tokens_response(user, request)


class TwoFactorVerifyView(generics.GenericAPIView):
    """Second step of login for a 2FA-enabled account — takes the
    challenge from LoginView plus a 6-digit TOTP code and, if it matches,
    issues the same tokens LoginView would have for a non-2FA account."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        user = _resolve_totp_challenge(request.data.get('challenge', ''))
        if not user:
            return Response({'detail': "Sessiya muddati tugagan, qaytadan kiring."}, status=status.HTTP_401_UNAUTHORIZED)
        if _is_locked(user):
            return _locked_response(user)

        code = str(request.data.get('code', ''))
        if not pyotp.TOTP(user.totp_secret).verify(code, valid_window=1):
            _register_failed_login(user, request, reason='2fa')
            return Response({'detail': "Kod noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)

        return _issue_tokens_response(user, request)


class TwoFactorSetupView(generics.GenericAPIView):
    """Starts (or restarts) 2FA enrollment: generates a fresh secret and
    returns it plus an otpauth:// URI for a QR code. Not yet enabled —
    TwoFactorConfirmView flips totp_enabled only once the user proves they
    can generate a matching code, so an abandoned setup never locks
    anyone out or silently turns on 2FA behind their back."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        if user.totp_enabled:
            # Re-running setup on an enabled account used to silently
            # replace (and so disable) the working secret — a hijacked
            # session could switch 2FA off that way without the password.
            return Response({'detail': "Ikki bosqichli tasdiqlash allaqachon yoqilgan."}, status=status.HTTP_400_BAD_REQUEST)
        secret = pyotp.random_base32()
        user.totp_secret = secret
        user.totp_enabled = False
        user.save(update_fields=['totp_secret', 'totp_enabled'])
        uri = pyotp.TOTP(secret).provisioning_uri(name=user.login_name, issuer_name="KO'RAGONIY EDU")
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
    authentication_classes = []

    def _reject(self, detail):
        response = Response({'detail': detail}, status=status.HTTP_401_UNAUTHORIZED)
        response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH)
        return response

    def post(self, request, *args, **kwargs):
        refresh_raw = request.COOKIES.get(REFRESH_COOKIE)
        if not refresh_raw:
            return Response({'detail': "Refresh token topilmadi."}, status=status.HTTP_401_UNAUTHORIZED)

        # Sessions revoked by a password change/reset, a block, or "log out
        # everywhere" must not be revivable through an old refresh cookie.
        try:
            parsed = RefreshToken(refresh_raw)
        except TokenError:
            return self._reject("Refresh token yaroqsiz.")
        user = User.objects.filter(pk=parsed.get(settings.SIMPLE_JWT['USER_ID_CLAIM'])).first()
        if not user or not user.is_active or token_predates_revocation(user, parsed.get('iat')):
            return self._reject("Sessiya bekor qilingan, qaytadan kiring.")

        serializer = self.get_serializer(data={'refresh': refresh_raw})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError:
            return self._reject("Refresh token yaroqsiz.")

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


class LogoutAllView(generics.GenericAPIView):
    """"Barcha qurilmalardan chiqish" — ends every session of this account,
    including the current one."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        revoke_all_tokens(request.user)
        log_event('logout_all', actor=request.user, request=request)
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
    unusable password, since there's nothing valid to verify).

    Every other session is ended (a password change is usually a reaction
    to a suspected leak); this one gets fresh tokens so it stays logged in."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        current = request.data.get('current_password', '')
        new = request.data.get('new_password', '')

        if user.has_usable_password() and not user.check_password(current):
            return Response({'detail': "Joriy parol noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)
        if current and current == new:
            return Response({'detail': "Yangi parol eskisidan farq qilishi kerak."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new, user=user)
        except DjangoValidationError as exc:
            return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new)
        user.must_change_password = False
        user.save(update_fields=['password', 'must_change_password'])
        revoke_all_tokens(user)
        log_event('password_changed', actor=user, request=request)
        notify_user(user, "🔐 Amaliy Fizika: parolingiz o'zgartirildi. Agar bu siz bo'lmasangiz, darhol parolni tiklang.")

        refresh = RefreshToken.for_user(user)
        response = Response({'detail': "Parol yangilandi.", 'access': str(refresh.access_token), 'user': MeSerializer(user).data})
        _set_refresh_cookie(response, refresh)
        return response


def _reset_code_hash(user, code: str) -> str:
    return salted_hmac(RESET_CODE_SALT, f'{user.pk}:{code}', algorithm='sha256').hexdigest()


GENERIC_RESET_RESPONSE = {
    'detail': (
        "Agar bunday hisob mavjud bo'lsa va unga Telegram (yoki email) ulangan bo'lsa, "
        "6 xonali tasdiqlash kodi yuborildi. Kod 10 daqiqa amal qiladi."
    ),
}


class PasswordResetRequestView(generics.GenericAPIView):
    """Step 1 of self-service reset: sends a 6-digit code to the account's
    linked Telegram (and email, when SMTP is configured). The response is
    identical whether or not the account exists or has any channel, so the
    endpoint can't be used to probe which logins are real."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetRateThrottle]

    def post(self, request, *args, **kwargs):
        login = str(request.data.get('login') or request.data.get('email') or '').strip()
        user = User.objects.find_by_login(login)
        if not user or not user.is_active:
            return Response(GENERIC_RESET_RESPONSE)

        now = timezone.now()
        recent = user.reset_codes.filter(created_at__gte=now - timedelta(days=1))
        if recent.count() >= RESET_CODES_PER_DAY or recent.filter(
            created_at__gte=now - timedelta(seconds=RESET_CODE_COOLDOWN_SECONDS)
        ).exists():
            log_event('password_reset_rate_limited', actor=user, request=request)
            return Response(GENERIC_RESET_RESPONSE)

        has_telegram = bool(user.telegram_linked and user.telegram_chat_id)
        has_email = bool(settings.EMAIL_ENABLED and user.email)
        if not (has_telegram or has_email):
            log_event('password_reset_no_channel', actor=user, request=request)
            return Response(GENERIC_RESET_RESPONSE)

        code = f'{secrets.randbelow(1_000_000):06d}'
        # Only the newest code is ever valid.
        user.reset_codes.filter(used_at__isnull=True).update(used_at=now)
        channels = []
        if has_telegram:
            channels.append('telegram')
        if has_email:
            channels.append('email')
        PasswordResetCode.objects.create(
            user=user,
            code_hash=_reset_code_hash(user, code),
            channels=','.join(channels),
            expires_at=now + timedelta(seconds=PasswordResetCode.MAX_AGE_SECONDS),
        )
        text = (
            f"🔑 Amaliy Fizika — parolni tiklash kodi: {code}\n"
            "Kod 10 daqiqa amal qiladi. Uni hech kimga bermang.\n"
            "Agar parolni siz tiklamoqchi bo'lmasangiz, bu xabarga e'tibor bermang."
        )
        if has_telegram:
            notify_user(user, text)
        if has_email:
            try:
                send_mail("Parolni tiklash kodi", text, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=True)
            except Exception:
                pass
        log_event('password_reset_requested', actor=user, request=request, detail=','.join(channels))
        return Response(GENERIC_RESET_RESPONSE)


class PasswordResetConfirmView(generics.GenericAPIView):
    """Step 2: login + code + new password. A code survives at most
    MAX_ATTEMPTS wrong guesses, then it's burned."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [PasswordResetConfirmRateThrottle]

    def post(self, request, *args, **kwargs):
        login = str(request.data.get('login') or request.data.get('email') or '').strip()
        code = str(request.data.get('code') or '').strip()
        new_password = str(request.data.get('new_password') or '')
        bad = Response({'detail': "Kod noto'g'ri yoki muddati o'tgan."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.find_by_login(login)
        if not user or not user.is_active or not code.isdigit():
            return bad
        now = timezone.now()
        rc = user.reset_codes.filter(used_at__isnull=True, expires_at__gt=now).first()
        if not rc:
            return bad

        rc.attempts += 1
        if not constant_time_compare(rc.code_hash, _reset_code_hash(user, code)):
            if rc.attempts >= PasswordResetCode.MAX_ATTEMPTS:
                rc.used_at = now
            rc.save(update_fields=['attempts', 'used_at'])
            log_event('password_reset_bad_code', actor=user, request=request)
            return bad

        try:
            validate_password(new_password, user=user)
        except DjangoValidationError as exc:
            # The code is still good — let them retry with a stronger password.
            rc.save(update_fields=['attempts'])
            return Response({'detail': ' '.join(exc.messages), 'code_ok': True}, status=status.HTTP_400_BAD_REQUEST)

        rc.used_at = now
        rc.save(update_fields=['attempts', 'used_at'])
        user.set_password(new_password)
        user.must_change_password = False
        user.failed_login_count = 0
        user.locked_until = None
        user.save(update_fields=['password', 'must_change_password', 'failed_login_count', 'locked_until'])
        revoke_all_tokens(user)
        log_event('password_reset_done', actor=user, request=request)
        notify_user(user, "🔐 Amaliy Fizika: parolingiz tiklandi. Agar bu siz bo'lmasangiz, darhol administratorga xabar bering.")
        return Response({'detail': "Parol yangilandi. Endi yangi parol bilan kiring."})


class TelegramLinkView(generics.GenericAPIView):
    """Issues a single-use deep link (t.me/<bot>?start=<token>) valid for
    15 minutes — the bot links whichever chat redeems it first."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        user.telegram_link_tokens.filter(used_at__isnull=True).update(used_at=timezone.now())
        token = secrets.token_urlsafe(24)
        TelegramLinkToken.objects.create(user=user, token=token)
        return Response({
            'url': f'https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={token}',
            'expires_in': TelegramLinkToken.MAX_AGE_SECONDS,
        })


class TelegramUnlinkView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        user = request.user
        user.telegram_linked = False
        user.telegram_chat_id = None
        user.telegram_username = ''
        user.save(update_fields=['telegram_linked', 'telegram_chat_id', 'telegram_username'])
        log_event('telegram_unlinked', actor=user, request=request)
        return Response(MeSerializer(user).data)


class AuditLogPagination(PageNumberPagination):
    page_size = 100


class AuditLogView(generics.ListAPIView):
    """Xavfsizlik jurnali — admin-level only (it shows IPs and logins)."""

    permission_classes = [IsAdminOrDevSuperuser]
    pagination_class = AuditLogPagination

    def get_queryset(self):
        qs = AuditLog.objects.all()
        action_filter = self.request.query_params.get('action')
        if action_filter:
            qs = qs.filter(action=action_filter)
        q = (self.request.query_params.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(actor_label__icontains=q) | Q(detail__icontains=q) | Q(ip__startswith=q))
        return qs

    def list(self, request, *args, **kwargs):
        page = self.paginate_queryset(self.get_queryset())
        rows = [
            {
                'id': e.id, 'created_at': e.created_at, 'action': e.action, 'actor': e.actor_label,
                'actor_id': e.actor_id, 'detail': e.detail, 'ip': e.ip, 'user_agent': e.user_agent,
            }
            for e in page
        ]
        return self.get_paginated_response(rows)


class UserAdminViewSet(viewsets.ReadOnlyModelViewSet):
    """Admin/dev-superuser user management: approve, block, reject
    (delete), promote/demote — mirrors the write branches of
    firestore.rules' users/{uid} rule.

    Student accounts are left out of the list unless ?role=student is
    asked for — there are far more of them than staff, and they're
    managed per class from the learning app's student screens.
    """

    queryset = User.objects.all()
    serializer_class = UserSerializer

    def get_queryset(self):
        qs = User.objects.all()
        user = self.request.user
        role = self.request.query_params.get('role')
        if self.action == 'list':
            if role == User.Role.STUDENT and user.is_oversight:
                qs = qs.filter(role=User.Role.STUDENT)
            else:
                qs = qs.exclude(role=User.Role.STUDENT)
        elif not user.is_admin:
            qs = qs.exclude(role=User.Role.STUDENT)
        return qs

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
        if self.action in ('promote', 'demote', 'set_boshliq', 'set_kuzatuvchi'):
            return [IsDevSuperuser()]
        return [IsAdminOrDevSuperuser()]

    def _guard_target(self, request, target: User):
        # A plain admin may never touch another admin or the dev superuser
        # — only the dev superuser can (mirrors: "plain admin -> only
        # non-admin target docs").
        if not request.user.is_dev_superuser and (target.is_admin or target.is_observer):
            raise PermissionDenied("Faqat dasturchi boshqa administratorni boshqara oladi.")

    def _label(self, target):
        return f"{target.name} ({target.login_name})"

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        target = self.get_object()
        self._guard_target(request, target)
        target.approved = True
        target.save(update_fields=['approved'])
        notify_admin_action(request.user, f"Foydalanuvchini tasdiqladi: {self._label(target)}")
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'])
    def block(self, request, pk=None):
        target = self.get_object()
        self._guard_target(request, target)
        target.approved = False
        target.save(update_fields=['approved'])
        # Blocking must take effect now, not when the current access
        # token happens to expire.
        revoke_all_tokens(target)
        notify_admin_action(request.user, f"Foydalanuvchini bloklashi: {self._label(target)}")
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        target = self.get_object()
        self._guard_target(request, target)
        label = self._label(target)
        target.delete()
        notify_admin_action(request.user, f"Foydalanuvchini rad etdi: {label}")
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _set_role(self, request, role, verb):
        target = self.get_object()
        if target.is_student:
            raise PermissionDenied("O'quvchi hisobining roli o'zgartirilmaydi.")
        old_role = target.get_role_display()
        target.role = role
        target.approved = True
        target.save(update_fields=['role', 'approved'])
        notify_admin_action(
            request.user,
            f"{verb}: {self._label(target)}\n• Roli: {old_role} → {target.get_role_display()}",
        )
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'])
    def promote(self, request, pk=None):
        return self._set_role(request, User.Role.ADMIN, "Administrator qildi")

    @action(detail=True, methods=['post'], url_path='set-boshliq')
    def set_boshliq(self, request, pk=None):
        return self._set_role(request, User.Role.BOSHLIQ, "Boshliq qildi")

    @action(detail=True, methods=['post'], url_path='set-kuzatuvchi')
    def set_kuzatuvchi(self, request, pk=None):
        return self._set_role(request, User.Role.KUZATUVCHI, "Kuzatuvchi qildi")

    @action(detail=True, methods=['post'])
    def demote(self, request, pk=None):
        target = self.get_object()
        if target.is_student:
            raise PermissionDenied("O'quvchi hisobining roli o'zgartirilmaydi.")
        old_role = target.get_role_display()
        target.role = User.Role.TEACHER
        target.save(update_fields=['role'])
        notify_admin_action(request.user, f"O'qituvchi darajasiga tushirdi: {self._label(target)}\n• Roli: {old_role} → {target.get_role_display()}")
        return Response(UserSerializer(target).data)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """Admin-initiated reset — the fallback when self-service reset
        (Telegram code) isn't available for this person. The generated
        password must be changed at first login."""
        target = self.get_object()
        self._guard_target(request, target)
        new_password = generate_readable_password()
        target.set_password(new_password)
        target.must_change_password = True
        target.failed_login_count = 0
        target.locked_until = None
        target.save(update_fields=['password', 'must_change_password', 'failed_login_count', 'locked_until'])
        revoke_all_tokens(target)
        notify_admin_action(request.user, f"Parolini tiklab berdi: {self._label(target)}")
        return Response({'password': new_password})

    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        target = self.get_object()
        self._guard_target(request, target)
        target.failed_login_count = 0
        target.locked_until = None
        target.save(update_fields=['failed_login_count', 'locked_until'])
        notify_admin_action(request.user, f"Hisob blokini ochdi: {self._label(target)}")
        return Response(AdminUserSerializer(target).data)

    @action(detail=True, methods=['post'], url_path='disable-2fa')
    def disable_2fa(self, request, pk=None):
        """Recovery path for a teacher who lost their authenticator device
        — mirrors reset_password's "admin does it for you" pattern."""
        target = self.get_object()
        self._guard_target(request, target)
        target.totp_secret = ''
        target.totp_enabled = False
        target.save(update_fields=['totp_secret', 'totp_enabled'])
        notify_admin_action(request.user, f"Ikki bosqichli tasdiqlashini o'chirdi: {self._label(target)}")
        return Response(UserSerializer(target).data)
