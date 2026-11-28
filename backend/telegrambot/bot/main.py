"""
Bot entrypoint — runs Telegram long-polling and the Channels-group/timer
watchers (announcements, translation jobs, the 24h lessons backup)
concurrently in one asyncio event loop. Started via `manage.py runbot`.
"""

import asyncio
import logging
import os
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode

from telegrambot.bot import backup_commands, handlers, library, replies
from telegrambot.bot.announcements import watch_announcements
from telegrambot.bot.dars_reminders import watch_dars_reminders
from telegrambot.bot.lessons_backup import watch_lessons_backup
from telegrambot.bot.license_reminders import watch_license_reminders
from telegrambot.bot.translation import watch_translation_jobs

logger = logging.getLogger(__name__)


async def set_app_button(bot: Bot) -> None:
    """The chat's menu button opens the platform as a mini app (owner,
    2026-11-28) — launched from here, it receives Telegram's initData and
    signs the linked account in (accounts/tg_webapp.py). The chat-list
    «Ochish» button is the bot's Main Mini App, set in @BotFather."""
    from aiogram.types import MenuButtonWebApp, WebAppInfo
    from django.conf import settings

    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Ochish", web_app=WebAppInfo(url=f"{settings.SITE_URL}/tg")))
    except Exception:  # never keeps the bot from starting
        logger.warning("Could not set the mini app menu button", exc_info=True)


async def run():
    token = os.environ.get("BOT_TOKEN")
    if not token:
        logger.error("BOT_TOKEN is not set — cannot start the bot.")
        sys.exit(1)

    bot = Bot(token=token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(handlers.router)
    dp.include_router(backup_commands.router)
    dp.include_router(library.router)
    dp.include_router(replies.router)

    logger.info("Bot ishga tushmoqda...")
    await set_app_button(bot)
    await asyncio.gather(
        dp.start_polling(bot),
        watch_announcements(bot),
        watch_translation_jobs(bot),
        watch_lessons_backup(bot),
        watch_license_reminders(bot),
        watch_dars_reminders(bot),
    )
