"""Hourly: tell the administration (and the school's ma'muriyat) when a
school's licence is close to its end — schools/licensing.py send_reminders
says each reminder (14, 7, 3, 1 days, the last day) once — and teachers
when an assigned course is nearly due (training/services.py)."""

import asyncio
import logging

from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)
CHECK_EVERY_SECONDS = 3600


def _send_sync() -> int:
    from achievements.badges import sync_all
    from schools.licensing import send_reminders
    from training.services import send_due_reminders

    # the same hourly check also reminds teachers of their courses'
    # deadlines and hands out the badges people reached since
    return send_reminders() + send_due_reminders() + sync_all()


async def watch_license_reminders(bot):  # noqa: ARG001 — kept for a consistent watcher signature
    logger.info("Licence reminders started (every %ss)", CHECK_EVERY_SECONDS)
    while True:
        try:
            sent = await sync_to_async(_send_sync)()
            if sent:
                logger.info("Licence reminders sent: %s", sent)
        except Exception:
            logger.exception("Licence reminder check failed, will retry next interval")
        await asyncio.sleep(CHECK_EVERY_SECONDS)
