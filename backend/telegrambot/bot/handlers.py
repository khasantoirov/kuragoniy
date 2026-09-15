"""
/start <uid> and /stop — account linking, ported from the old bot/index.js.
Writes directly to the Django ORM (same db.sqlite3 file as the web app,
WAL mode enabled — see config/settings/base.py DATABASES).
"""

import logging

from aiogram import Router
from aiogram.filters import CommandStart, Command
from aiogram.types import Message
from asgiref.sync import sync_to_async

from accounts.models import User

from .library import main_menu_keyboard

logger = logging.getLogger(__name__)
router = Router(name="linking")


@sync_to_async
def _link_account(uid: str, chat_id: int, username: str | None) -> bool:
    updated = User.objects.filter(id=uid).update(
        telegram_linked=True,
        telegram_chat_id=chat_id,
        telegram_username=username or "",
    )
    return updated > 0


@sync_to_async
def _unlink_by_chat(chat_id: int) -> int:
    return User.objects.filter(telegram_chat_id=chat_id).update(
        telegram_linked=False, telegram_chat_id=None
    )


@router.message(CommandStart(deep_link=True))
async def start_with_uid(message: Message, command):
    uid = command.args
    ok = await _link_account(uid, message.chat.id, message.from_user.username if message.from_user else None)
    if ok:
        await message.answer("✅ Hisobingiz ulandi. Endi e'lonlarni shu yerda olasiz.", reply_markup=main_menu_keyboard())
    else:
        await message.answer("❌ Havola yaroqsiz. Platformada «Telegramni ulash» tugmasini qayta bosing.")


@router.message(CommandStart())
async def start_plain(message: Message):
    await message.answer(
        "Salom! Bu STEM LMS platformasining rasmiy boti.\n\n"
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
