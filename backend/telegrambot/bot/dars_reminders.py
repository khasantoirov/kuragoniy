"""Every few minutes: the teachers' daily lesson reminders —
staffroom/reminders.py decides when (morning / evening of a school day) and
remembers what went out, so each message goes once a day."""

import asyncio
import logging

from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)
CHECK_EVERY_SECONDS = 300


def _send_sync() -> int:
    from staffroom.reminders import send_due

    return send_due()


async def watch_dars_reminders(bot):  # noqa: ARG001 — kept for a consistent watcher signature
    logger.info("Lesson reminders started (every %ss)", CHECK_EVERY_SECONDS)
    while True:
        try:
            sent = await sync_to_async(_send_sync)()
            if sent:
                logger.info("Lesson reminders sent: %s", sent)
        except Exception:
            logger.exception("Lesson reminder check failed, will retry next interval")
        await asyncio.sleep(CHECK_EVERY_SECONDS)
