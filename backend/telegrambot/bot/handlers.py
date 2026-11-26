"""
/start <token> and /stop — account linking, ported from the old bot/index.js.
Writes directly to the Django ORM (same db.sqlite3 file as the web app,
WAL mode enabled — see config/settings/base.py DATABASES).

The deep-link payload is a single-use TelegramLinkToken issued by
POST /api/accounts/me/telegram-link/, never the raw user id: ids are
visible to colleagues, and a linked chat receives password-reset codes.
"""

import logging
from datetime import timedelta

from aiogram import F, Router
from aiogram.filters import CommandStart, Command
from aiogram.types import KeyboardButton, Message, ReplyKeyboardMarkup
from asgiref.sync import sync_to_async
from django.db import transaction
from django.utils import timezone

from accounts import phone_auth
from accounts.models import TelegramLinkToken, User

from .library import main_menu_keyboard

logger = logging.getLogger(__name__)
router = Router(name="linking")


@sync_to_async
def _link_account(token: str, chat_id: int, username: str | None) -> bool:
    if not token:
        return False
    fresh_after = timezone.now() - timedelta(seconds=TelegramLinkToken.MAX_AGE_SECONDS)
    with transaction.atomic():
        # Conditional update = atomic "claim": of two chats racing on the
        # same token, exactly one sees updated == 1.
        claimed = TelegramLinkToken.objects.filter(
            token=token, used_at__isnull=True, created_at__gte=fresh_after,
        ).update(used_at=timezone.now())
        if not claimed:
            return False
        link = TelegramLinkToken.objects.select_related('user').get(token=token)
        User.objects.filter(pk=link.user_id).update(
            telegram_linked=True,
            telegram_chat_id=chat_id,
            telegram_username=username or "",
        )
    return True


@sync_to_async
def _unlink_by_chat(chat_id: int) -> int:
    return User.objects.filter(telegram_chat_id=chat_id).update(
        telegram_linked=False, telegram_chat_id=None
    )


CONTACT_KEYBOARD = ReplyKeyboardMarkup(
    keyboard=[[KeyboardButton(text="📱 Raqamni yuborish", request_contact=True)]],
    resize_keyboard=True, one_time_keyboard=True,
)


@sync_to_async
def _claim_phone(link_token: str, chat_id: int, username: str | None) -> bool:
    return phone_auth.claim_from_bot(link_token, chat_id, username) is not None


@sync_to_async
def _contact(chat_id, phone, contact_user_id, from_user_id, username):
    status, v, code = phone_auth.contact_from_bot(chat_id, phone, contact_user_id, from_user_id, username)
    return status, (phone_auth.code_message(v, code) if code else None)


async def _start_phone(message: Message, link_token: str):
    """/start ph_<token> from the site's phone sign-in: ask for the number."""
    username = message.from_user.username if message.from_user else None
    if not await _claim_phone(link_token, message.chat.id, username):
        await message.answer("❌ Havola yaroqsiz yoki muddati o'tgan. Saytda raqamingizni qaytadan kiriting.")
        return
    await message.answer(
        "Telefon raqamingizni tasdiqlash uchun pastdagi «📱 Raqamni yuborish» tugmasini bosing.\n\n"
        "Raqam saytda kiritilgan raqam bilan bir xil bo'lishi kerak.",
        reply_markup=CONTACT_KEYBOARD,
    )


@router.message(F.contact)
async def contact_shared(message: Message):
    c = message.contact
    status, text = await _contact(message.chat.id, c.phone_number, c.user_id,
                                  message.from_user.id if message.from_user else None,
                                  message.from_user.username if message.from_user else None)
    if status == 'sent':
        await message.answer(text, reply_markup=main_menu_keyboard())
    elif status == 'not_own':
        await message.answer("Faqat o'zingizning raqamingizni yuboring — «📱 Raqamni yuborish» tugmasi orqali.",
                             reply_markup=CONTACT_KEYBOARD)
    elif status == 'mismatch':
        await message.answer("Bu raqam saytda kiritilgan raqamga mos kelmadi. Saytda raqamni tekshirib, qaytadan boshlang.",
                             reply_markup=main_menu_keyboard())
    else:
        await message.answer("Tasdiqlanadigan raqam topilmadi. Saytda raqamingizni kiritib, «Telegram orqali tasdiqlash»ni bosing.",
                             reply_markup=main_menu_keyboard())


@router.message(CommandStart(deep_link=True))
async def start_with_uid(message: Message, command):
    token = (command.args or '').strip()
    if token.startswith(phone_auth.LINK_PREFIX):
        await _start_phone(message, token[len(phone_auth.LINK_PREFIX):])
        return
    ok = await _link_account(token, message.chat.id, message.from_user.username if message.from_user else None)
    if ok:
        await message.answer("✅ Hisobingiz ulandi. Endi e'lonlarni shu yerda olasiz.", reply_markup=main_menu_keyboard())
    else:
        await message.answer(
            "❌ Havola yaroqsiz yoki muddati o'tgan (15 daqiqa amal qiladi). "
            "Platformada «Telegramni ulash» tugmasini qayta bosing."
        )


@router.message(CommandStart())
async def start_plain(message: Message):
    await message.answer(
        "Salom! Bu KO'RAGONIY EDU platformasining rasmiy boti.\n\n"
        "Hisobingizni ulash uchun platformada «Telegramni ulash» tugmasini bosing.",
        reply_markup=main_menu_keyboard(),
    )


@router.message(Command("stop"))
async def stop(message: Message):
    n = await _unlink_by_chat(message.chat.id)
    if n:
        await message.answer("Hisobingiz uzildi. E'lonlar endi kelmaydi.")
    else:
        await message.answer("Ulangan hisob topilmadi.")
