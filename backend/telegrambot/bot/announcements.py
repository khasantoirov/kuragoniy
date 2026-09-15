"""
Announcement fan-out — joins the same 'announcements' Channels group that
realtime/consumers.py's AnnouncementConsumer uses for the web frontend,
replacing the old Firestore onSnapshot listener. This requires a real
Redis-backed channel layer (REDIS_URL set) since the bot runs as a
separate OS process from the Django ASGI server — see settings/base.py.
"""

import asyncio
import html
import logging

from aiogram import Bot
from aiogram.exceptions import TelegramForbiddenError
from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.utils import timezone

from accounts.models import User
from telegrambot.models import BotMeta

logger = logging.getLogger(__name__)

GROUP_NAME = "announcements"
PACING_SECONDS = 0.04  # Telegram rate-limit pacing, matches the old bot


@sync_to_async
def _get_or_init_meta():
    return BotMeta.objects.get_or_create(key="initialized", defaults={"value": {}})


@sync_to_async
def _mark_initialized():
    BotMeta.objects.update_or_create(
        key="initialized", defaults={"value": {"at": timezone.now().isoformat()}}
    )


@sync_to_async
def _linked_users():
    return list(User.objects.filter(telegram_linked=True).values_list("id", "telegram_chat_id"))


@sync_to_async
def _unlink(user_id):
    User.objects.filter(id=user_id).update(telegram_linked=False, telegram_chat_id=None)


async def watch_announcements(bot: Bot):
    """Guards against blasting pre-existing announcements on first deploy
    via a BotMeta 'initialized' flag, then fans out every new one."""
    _, created = await _get_or_init_meta()
    if created:
        await _mark_initialized()
        logger.info("First run: existing announcements will not be resent.")

    channel_layer = get_channel_layer()
    channel_name = await channel_layer.new_channel()
    await channel_layer.group_add(GROUP_NAME, channel_name)
    logger.info("Listening for announcements on Channels group '%s'", GROUP_NAME)

    while True:
        try:
            event = await channel_layer.receive(channel_name)
        except Exception:
            # channels_redis's receive() blocks on a Redis BRPOP and can
            # raise a client-side timeout/connection hiccup with nothing
            # to actually report — that's normal idle behavior, not a
            # fatal error, so log and keep listening instead of taking
            # the whole bot process down with it.
            logger.warning("Transient error while waiting for announcements, retrying", exc_info=True)
            continue
        await _send_announcement(bot, event.get("payload", {}))


def _compose_announcement_message(text: str, by: str | None) -> str:
    # The bot's default parse_mode is HTML — a bare '<'/'&' in an
    # admin-authored announcement would otherwise make send_message raise
    # "can't parse entities" for every single recipient at once.
    return f"📢 {html.escape(text)}" + (f"\n\n— {html.escape(by)}" if by else "")


async def _send_announcement(bot: Bot, payload: dict):
    text = payload.get("text", "")
    by = payload.get("by")
    message = _compose_announcement_message(text, by)

    recipients = await _linked_users()
    logger.info("Fanning out announcement %r to %d linked user(s)", text[:40], len(recipients))

    sent = 0
    for user_id, chat_id in recipients:
        if not chat_id:
            logger.warning("User %s is telegram_linked but has no chat_id, skipping", user_id)
            continue
        try:
            await bot.send_message(chat_id, message)
            sent += 1
        except TelegramForbiddenError:
            logger.warning("Chat %s blocked the bot — unlinking user %s", chat_id, user_id)
            await _unlink(user_id)
        except Exception:
            logger.exception("Failed to send announcement to chat %s", chat_id)
        await asyncio.sleep(PACING_SECONDS)

    logger.info("Announcement fan-out done: %d/%d sent", sent, len(recipients))
