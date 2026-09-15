"""Admin-only /backup and /backup_status Telegram commands, gated by the
ADMIN_TELEGRAM_IDS env var — ported from bot/backup/telegram-integration.js."""

import os

from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message
from asgiref.sync import sync_to_async

from telegrambot.backup import list_backups, run_backup

router = Router(name="backup")


def _admin_ids() -> set[int]:
    raw = os.environ.get("ADMIN_TELEGRAM_IDS", "")
    return {int(x) for x in raw.split(",") if x.strip().isdigit()}


def _is_admin(message: Message) -> bool:
    return bool(message.from_user) and message.from_user.id in _admin_ids()


@router.message(Command("backup"))
async def backup_now(message: Message):
    if not _is_admin(message):
        return
    await message.answer("Backup boshlandi...")
    path = await sync_to_async(run_backup)()
    size_kb = path.stat().st_size / 1024
    await message.answer(f"✅ Backup tayyor: {path.name} ({size_kb:.0f} KB)")


@router.message(Command("backup_status"))
async def backup_status(message: Message):
    if not _is_admin(message):
        return
    backups = await sync_to_async(list_backups)()
    if not backups:
        await message.answer("Hali backup yo'q.")
        return
    lines = [f"{b.name} — {b.stat().st_size / 1024:.0f} KB" for b in backups[:10]]
    await message.answer("So'nggi backuplar:\n" + "\n".join(lines))
