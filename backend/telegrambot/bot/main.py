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
from telegrambot.bot.lessons_backup import watch_lessons_backup
from telegrambot.bot.translation import watch_translation_jobs

logger = logging.getLogger(__name__)


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
    await asyncio.gather(
        dp.start_polling(bot),
        watch_announcements(bot),
        watch_translation_jobs(bot),
        watch_lessons_backup(bot),
    )
