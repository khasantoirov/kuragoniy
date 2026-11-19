"""Signing in / up with a phone number, proven through the Telegram bot.

    browser                         server                       bot
    phone ─────────── start ──▶ PhoneVerification(ticket, link_token)
      linked account ─────────▶ code ─────────────────────────▶ chat
      not linked ◀── bot_url ── (t.me/<bot>?start=ph_<link_token>)
                                          /start ph_… ◀──────── person
                                          contact (own number) ◀ person
                                          matches → code ──────▶ chat
    code ──────────── verify ─▶ tokens (login) / ticket (register)
    password ──────── complete ▶ new account, waiting for approval

Shared by the API views (accounts/phone_views.py) and the bot
(telegrambot/bot/handlers.py) — the bot writes to the same database."""

import re
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac

from .models import PhoneVerification, User

CODE_SALT = 'accounts.phone-verification-code'
LINK_PREFIX = 'ph_'


def _digits(value) -> str:
    d = re.sub(r'\D', '', str(value or ''))
    return '998' + d if len(d) == 9 else d


def same_phone(a, b) -> bool:
    da = _digits(a)
    return bool(da) and da == _digits(b)


def users_with_phone(phone) -> list[User]:
    """Active accounts carrying this number — however it was typed in."""
    return [u for u in User.objects.filter(is_active=True).exclude(phone='') if same_phone(u.phone, phone)]


def bot_url(v: PhoneVerification) -> str:
    return f'https://t.me/{settings.TELEGRAM_BOT_USERNAME}?start={LINK_PREFIX}{v.link_token}'


def start(purpose: str, phone: str, *, user: User | None = None, first_name: str = '', last_name: str = '') -> PhoneVerification:
    chat = user.telegram_chat_id if user and user.telegram_linked and user.telegram_chat_id else None
    return PhoneVerification.objects.create(
        ticket=secrets.token_urlsafe(24), link_token=secrets.token_urlsafe(18),
        purpose=purpose, phone=phone, user=user, first_name=first_name, last_name=last_name, chat_id=chat,
    )


def _fresh_qs():
    return PhoneVerification.objects.filter(
        used_at__isnull=True, created_at__gte=timezone.now() - timedelta(seconds=PhoneVerification.MAX_AGE_SECONDS))


def by_ticket(ticket) -> PhoneVerification | None:
    return _fresh_qs().filter(ticket=str(ticket or '')).select_related('user').first() if ticket else None


def _hash(v: PhoneVerification, code: str) -> str:
    return salted_hmac(CODE_SALT, f'{v.ticket}:{code}', algorithm='sha256').hexdigest()


def new_code(v: PhoneVerification) -> str:
    code = f'{secrets.randbelow(10 ** 6):06d}'
    v.code_hash = _hash(v, code)
    v.code_sent_at = timezone.now()
    v.attempts = 0
    v.save(update_fields=['code_hash', 'code_sent_at', 'attempts'])
    return code


def code_message(v: PhoneVerification, code: str) -> str:
    what = 'kirish' if v.purpose == PhoneVerification.Purpose.LOGIN else "ro'yxatdan o'tish"
    return (f"Ko'ragoniy Edu — {what} kodi: {code}\n\n"
            "10 daqiqa amal qiladi. Kodni hech kimga bermang — xodimlarimiz uni hech qachon so'ramaydi.")


def resend_in(v: PhoneVerification) -> int:
    if not v.code_sent_at:
        return 0
    left = PhoneVerification.RESEND_SECONDS - (timezone.now() - v.code_sent_at).total_seconds()
    return max(0, int(left + 0.999))


def check_code(v: PhoneVerification, code) -> bool:
    """True once for the right code; a wrong one uses up a try."""
    if not v.code_hash or not v.code_sent_at or v.attempts >= PhoneVerification.MAX_ATTEMPTS:
        return False
    if v.code_sent_at < timezone.now() - timedelta(seconds=PhoneVerification.CODE_AGE_SECONDS):
        return False
    ok = constant_time_compare(v.code_hash, _hash(v, re.sub(r'\D', '', str(code or ''))))
    if not ok:
        v.attempts += 1
        v.save(update_fields=['attempts'])
    return ok


# ── the bot's side ────────────────────────────────────────────────────

def claim_from_bot(link_token: str, chat_id: int, username: str | None) -> PhoneVerification | None:
    """/start ph_<token>: this chat takes the verification over (once)."""
    v = _fresh_qs().filter(link_token=link_token).first()
    if v is None or (v.chat_id and v.chat_id != chat_id):
        return None
    v.chat_id = chat_id
    v.tg_username = username or ''
    v.save(update_fields=['chat_id', 'tg_username'])
    return v


def contact_from_bot(chat_id: int, contact_phone: str, contact_user_id, from_user_id, username: str | None):
    """A shared contact. Returns (status, verification, code): 'sent' with
    the code to give, or 'not_own' / 'none' / 'mismatch'."""
    if not contact_user_id or contact_user_id != from_user_id:
        return 'not_own', None, None
    v = _fresh_qs().filter(chat_id=chat_id).select_related('user').first()
    if v is None:
        return 'none', None, None
    if not same_phone(v.phone, contact_phone):
        return 'mismatch', v, None
    u = v.user
    if u is not None and (not u.telegram_chat_id or u.telegram_chat_id == chat_id):
        # the number is proven theirs: their account gets this chat too
        User.objects.filter(pk=u.pk).update(telegram_linked=True, telegram_chat_id=chat_id,
                                            telegram_username=username or u.telegram_username)
    return 'sent', v, new_code(v)
