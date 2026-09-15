"""Sends a full lessons+experiments JSON export to every linked
admin/dev-superuser (not boshliq — this backup is admin-only) once every
24 hours — a lightweight, always up to date backup of the platform's
actual teaching content (the labor-intensive part to recreate),
independent of the full-database /backup
command (backup_commands.py) which is on-demand and admin-triggered only,
and of lessons.signals.backup_lessons_on_change's on-edit trigger (fires
immediately per change; this one guarantees a backup exists even on a day
with no edits at all).

The export (lessons.backup.build_lessons_backup, shared with the on-edit
trigger) matches AdminPage.tsx's "Darslarni eksport (JSON)" button exactly
(both are just LessonSerializer output), so the file this sends can be fed
straight back into "Darslarni import qilish" if content ever needs
restoring.
"""

import asyncio
import logging
from datetime import datetime, timedelta

from aiogram import Bot
from aiogram.types import BufferedInputFile
from asgiref.sync import sync_to_async
from django.db.models import Q
from django.utils import timezone

from telegrambot.models import BotMeta

logger = logging.getLogger(__name__)

META_KEY = 'lessons_backup'
INTERVAL = timedelta(hours=24)
CHECK_EVERY_SECONDS = 60 * 60  # poll hourly; cheap, and tolerant of bot restarts


def _prepare_if_due_sync():
    """Returns (json_bytes, filename, [chat_id, ...]) if a backup is due
    right now, or (None, None, None) if the last one was sent less than
    INTERVAL ago. A missing BotMeta row (first ever run) counts as due."""
    from accounts.models import User
    from lessons.backup import build_lessons_backup

    meta, _ = BotMeta.objects.get_or_create(key=META_KEY, defaults={'value': {}})
    last_at_raw = meta.value.get('at')
    now = timezone.now()
    if last_at_raw:
        last_at = datetime.fromisoformat(last_at_raw)
        if now - last_at < INTERVAL:
            return None, None, None

    recipients = list(
        User.objects.filter(telegram_linked=True)
        .filter(Q(is_dev_superuser=True) | Q(role=User.Role.ADMIN))
        .exclude(telegram_chat_id__isnull=True)
        .values_list('telegram_chat_id', flat=True)
    )
    if not recipients:
        # Nothing to send to — don't mark as sent, so it's retried once
        # someone actually links a Telegram account.
        return None, None, None

    payload, filename = build_lessons_backup()

    meta.value = {'at': now.isoformat()}
    meta.save(update_fields=['value'])

    return payload, filename, recipients


_prepare_if_due = sync_to_async(_prepare_if_due_sync)


async def watch_lessons_backup(bot: Bot):
    logger.info("Lessons backup scheduler started (every %s)", INTERVAL)
    while True:
        try:
            payload, filename, recipients = await _prepare_if_due()
            if payload:
                caption = f"🗂 Darslar zaxirasi — {len(recipients)} ta qabul qiluvchi"
                for chat_id in recipients:
                    try:
                        await bot.send_document(
                            chat_id,
                            BufferedInputFile(payload, filename=filename),
                            caption=caption,
                        )
                    except Exception:
                        logger.exception("Failed to send lessons backup to chat %s", chat_id)
        except Exception:
            logger.exception("Lessons backup check failed, will retry next interval")
        await asyncio.sleep(CHECK_EVERY_SECONDS)
