import asyncio
import logging

from django.core.management.base import BaseCommand

from telegrambot.bot.main import run

logging.basicConfig(level=logging.INFO)


class Command(BaseCommand):
    help = "Runs the Telegram bot (long-polling + Channels group watchers). Requires BOT_TOKEN env var."

    def handle(self, *args, **options):
        try:
            asyncio.run(run())
        except KeyboardInterrupt:
            self.stdout.write("Bot to'xtatildi.")
