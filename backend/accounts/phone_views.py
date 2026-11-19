"""Phone sign-in / sign-up endpoints (see accounts/phone_auth.py for the
flow). reCAPTCHA-checked and throttled; the login/password sign-in
(LoginView) stays as it is beside them."""

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from common.audit import notify_admin_action, send_telegram_message
from common.captcha import FAILED as CAPTCHA_FAILED
from common.captcha import captcha_ok
from common.security import log_event
from common.throttling import PhoneStartRateThrottle, PhoneVerifyRateThrottle

from . import phone_auth
from .models import PhoneVerification, User
from .profile import clean_first_name, clean_last_name, clean_phone, full_name

EXPIRED = "Tasdiqlash muddati o'tgan. Raqamni qaytadan kiriting."


def _phone(request):
    try:
        return clean_phone(request.data.get('phone'))
    except ValidationError as exc:
        raise ValidationError({'phone': exc.detail})


def _next_step(v: PhoneVerification) -> Response:
    """A linked account gets its code now; anyone else first opens the bot."""
    if v.chat_id:
        code = phone_auth.new_code(v)
        send_telegram_message(v.chat_id, phone_auth.code_message(v, code))
        return Response({'step': 'code', 'ticket': v.ticket, 'via': 'telegram',
                         'resend_in': PhoneVerification.RESEND_SECONDS, 'bot_url': phone_auth.bot_url(v)})
    return Response({'step': 'telegram', 'ticket': v.ticket, 'bot_url': phone_auth.bot_url(v)})


class _Public(generics.GenericAPIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []


class PhoneStartView(_Public):
    """POST {phone, captcha} — "Hisobingizga kiring". A known number goes
    to its code; an unknown one to sign-up; one shared by several accounts
    to the login/password form."""

    throttle_classes = [PhoneStartRateThrottle]

    def post(self, request, *args, **kwargs):
        if not captcha_ok(request, 'phone_start'):
            return Response({'detail': CAPTCHA_FAILED}, status=status.HTTP_400_BAD_REQUEST)
        phone = _phone(request)
        users = phone_auth.users_with_phone(phone)
        if len(users) > 1:
            return Response({'step': 'password', 'detail': "Bu raqam bir nechta hisobda turibdi — login va parol bilan kiring."},
                            status=status.HTTP_409_CONFLICT)
        if not users:
            return Response({'step': 'register', 'phone': phone})
        user = users[0]
        from .views import _is_locked, _locked_response
        if _is_locked(user):
            return _locked_response(user)
        return _next_step(phone_auth.start(PhoneVerification.Purpose.LOGIN, phone, user=user))


class PhoneRegisterStartView(_Public):
    """POST {phone, first_name, last_name, captcha} — "Ro'yxatdan o'tish"."""

    throttle_classes = [PhoneStartRateThrottle]

    def post(self, request, *args, **kwargs):
        if not captcha_ok(request, 'phone_register'):
            return Response({'detail': CAPTCHA_FAILED}, status=status.HTTP_400_BAD_REQUEST)
        errors = {}
        try:
            first = clean_first_name(request.data.get('first_name'))
        except ValidationError as exc:
            errors['first_name'] = exc.detail
        try:
            last = clean_last_name(request.data.get('last_name'))
        except ValidationError as exc:
            errors['last_name'] = exc.detail
        if errors:
            raise ValidationError(errors)
        phone = _phone(request)
        if phone_auth.users_with_phone(phone):
            return Response({'step': 'login', 'detail': "Bu raqam ro'yxatdan o'tgan — shu raqam bilan kiring."},
                            status=status.HTTP_409_CONFLICT)
        return _next_step(phone_auth.start(PhoneVerification.Purpose.REGISTER, phone, first_name=first, last_name=last))


class PhoneStatusView(_Public):
    """GET ?ticket= — the page waits on this while the person is in the bot."""

    throttle_classes = [PhoneVerifyRateThrottle]

    def get(self, request, *args, **kwargs):
        v = phone_auth.by_ticket(request.query_params.get('ticket'))
        if v is None:
            return Response({'detail': EXPIRED}, status=status.HTTP_410_GONE)
        return Response({'chat': bool(v.chat_id), 'code_sent': bool(v.code_sent_at), 'resend_in': phone_auth.resend_in(v)})


class PhoneResendView(_Public):
    throttle_classes = [PhoneStartRateThrottle]

    def post(self, request, *args, **kwargs):
        v = phone_auth.by_ticket(request.data.get('ticket'))
        if v is None:
            return Response({'detail': EXPIRED}, status=status.HTTP_410_GONE)
        if not v.chat_id:
            return Response({'step': 'telegram', 'ticket': v.ticket, 'bot_url': phone_auth.bot_url(v)})
        wait = phone_auth.resend_in(v)
        if wait:
            return Response({'detail': f'{wait} soniyadan keyin qayta yuborish mumkin.', 'resend_in': wait},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        code = phone_auth.new_code(v)
        send_telegram_message(v.chat_id, phone_auth.code_message(v, code))
        return Response({'step': 'code', 'ticket': v.ticket, 'resend_in': PhoneVerification.RESEND_SECONDS})


class PhoneVerifyView(_Public):
    """POST {ticket, code, remember} — signs in, or (sign-up) moves on to
    the password."""

    throttle_classes = [PhoneVerifyRateThrottle]

    def post(self, request, *args, **kwargs):
        from .views import _issue_tokens_response, _make_totp_challenge, _wants_remember

        v = phone_auth.by_ticket(request.data.get('ticket'))
        if v is None:
            return Response({'detail': EXPIRED}, status=status.HTTP_410_GONE)
        if v.attempts >= PhoneVerification.MAX_ATTEMPTS:
            return Response({'detail': "Urinishlar tugadi — yangi kod oling."}, status=status.HTTP_400_BAD_REQUEST)
        if not phone_auth.check_code(v, request.data.get('code')):
            return Response({'detail': "Kod noto'g'ri yoki muddati o'tgan."}, status=status.HTTP_400_BAD_REQUEST)

        if v.purpose == PhoneVerification.Purpose.REGISTER:
            v.verified_at = timezone.now()
            v.save(update_fields=['verified_at'])
            return Response({'step': 'password', 'ticket': v.ticket})

        user = v.user
        v.used_at = timezone.now()
        v.save(update_fields=['used_at'])
        if user is None or not user.is_active:
            return Response({'detail': EXPIRED}, status=status.HTTP_410_GONE)
        log_event('login_phone', actor=user, request=request)
        remember = _wants_remember(request)
        if user.totp_enabled:
            return Response({'totp_required': True, 'challenge': _make_totp_challenge(user, remember)})
        return _issue_tokens_response(user, request, remember=remember)


class PhoneCompleteView(_Public):
    """POST {ticket, password} — a verified sign-up becomes an account that
    waits for the administration's approval (and their pick of subject)."""

    throttle_classes = [PhoneVerifyRateThrottle]

    def post(self, request, *args, **kwargs):
        from learning.student_accounts import unique_username

        from .views import _issue_tokens_response

        v = phone_auth.by_ticket(request.data.get('ticket'))
        if v is None or v.purpose != PhoneVerification.Purpose.REGISTER or not v.verified_at:
            return Response({'detail': EXPIRED}, status=status.HTTP_410_GONE)
        if phone_auth.users_with_phone(v.phone):
            return Response({'step': 'login', 'detail': "Bu raqam ro'yxatdan o'tgan — shu raqam bilan kiring."},
                            status=status.HTTP_409_CONFLICT)
        password = str(request.data.get('password') or '')
        name = full_name(v.first_name, v.last_name)
        try:
            validate_password(password, user=User(name=name))
        except DjangoValidationError as exc:
            raise ValidationError({'password': list(exc.messages)})
        with transaction.atomic():
            user = User.objects.create_user(
                email=None, password=password, username=unique_username(name),
                name=name, first_name=v.first_name, last_name=v.last_name, phone=v.phone,
                role=User.Role.TEACHER, approved=False,
                telegram_linked=bool(v.chat_id), telegram_chat_id=v.chat_id, telegram_username=v.tg_username,
            )
            v.used_at = timezone.now()
            v.user = user
            v.save(update_fields=['used_at', 'user'])
        log_event('register_phone', actor=user, request=request)
        notify_admin_action(user, f"Telefon orqali ro'yxatdan o'tdi: {name} ({v.phone}) — tasdiqlash kutilmoqda")
        return _issue_tokens_response(user, request, remember=True, extra={'login': user.username})
