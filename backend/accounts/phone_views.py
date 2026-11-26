"""Phone sign-in endpoints (see accounts/phone_auth.py for the flow).

Brought back on 2026-11-26 at the owner's request ("Telefon bilan kirishni
qaytar"), as a way in for accounts that already exist: the number must be
on exactly one account. Nobody signs up by phone — new staff are made by
the administration. Bot-guarded (common/formguard.py) and throttled; the
login/password sign-in (LoginView) stays beside it. At admin.kuragoniy.uz
only an Admin or the developer gets through (common/adminhost.py)."""

from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from common.audit import send_telegram_message
from common.formguard import FAILED as GUARD_FAILED
from common.formguard import guard_ok
from common.security import log_event
from common.throttling import PhoneStartRateThrottle, PhoneVerifyRateThrottle

from . import phone_auth
from .models import PhoneVerification
from .profile import clean_phone

EXPIRED = "Tasdiqlash muddati o'tgan. Raqamni qaytadan kiriting."
UNKNOWN = ("Bu raqam hech bir hisobga biriktirilmagan. Login va parol bilan kiring "
           "yoki raqamingizni hisobingizga qo'shish uchun maktab ma'muriyatiga murojaat qiling.")


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
    """POST {phone, guard} — "Telefon raqam" on the sign-in page. A known
    number goes to its code; one shared by several accounts to the
    login/password form; an unknown one is told to use the password."""

    throttle_classes = [PhoneStartRateThrottle]

    def post(self, request, *args, **kwargs):
        from common.adminhost import refusal

        if not guard_ok(request, 'phone_start'):
            return Response({'detail': GUARD_FAILED}, status=status.HTTP_400_BAD_REQUEST)
        phone = _phone(request)
        users = phone_auth.users_with_phone(phone)
        if len(users) > 1:
            return Response({'step': 'password', 'detail': "Bu raqam bir nechta hisobda turibdi — login va parol bilan kiring."},
                            status=status.HTTP_409_CONFLICT)
        if not users:
            return Response({'step': 'password', 'detail': UNKNOWN}, status=status.HTTP_404_NOT_FOUND)
        user = users[0]
        from .views import _is_locked, _locked_response
        if _is_locked(user):
            return _locked_response(user)
        refused = refusal(request, user, phone=True)  # admin.kuragoniy.uz: no code for a non-admin; none for an admin account
        if refused:
            return refused
        return _next_step(phone_auth.start(PhoneVerification.Purpose.LOGIN, phone, user=user))


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
    """POST {ticket, code, remember} — the right code signs in (or, with
    the authenticator on, moves on to its code)."""

    throttle_classes = [PhoneVerifyRateThrottle]

    def post(self, request, *args, **kwargs):
        from common.adminhost import refusal

        from .views import _issue_tokens_response, _wants_remember

        v = phone_auth.by_ticket(request.data.get('ticket'))
        if v is None or v.purpose != PhoneVerification.Purpose.LOGIN:
            return Response({'detail': EXPIRED}, status=status.HTTP_410_GONE)
        if v.attempts >= PhoneVerification.MAX_ATTEMPTS:
            return Response({'detail': "Urinishlar tugadi — yangi kod oling."}, status=status.HTTP_400_BAD_REQUEST)
        if not phone_auth.check_code(v, request.data.get('code')):
            return Response({'detail': "Kod noto'g'ri yoki muddati o'tgan."}, status=status.HTTP_400_BAD_REQUEST)

        user = v.user
        v.used_at = timezone.now()
        v.save(update_fields=['used_at'])
        if user is None or not user.is_active:
            return Response({'detail': EXPIRED}, status=status.HTTP_410_GONE)
        refused = refusal(request, user, phone=True)  # a ticket from kuragoniy.uz brought to the panel
        if refused:
            return refused
        log_event('login_phone', actor=user, request=request)
        return _issue_tokens_response(user, request, remember=_wants_remember(request))
