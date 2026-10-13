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

from aiogram import Router
from aiogram.filters import CommandStart, Command
from aiogram.types import Message
from asgiref.sync import sync_to_async
from django.db import transaction
from django.utils import timezone

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


@router.message(CommandStart(deep_link=True))
async def start_with_uid(message: Message, command):
    token = (command.args or '').strip()
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
