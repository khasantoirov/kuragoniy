"""notify() — the one place events reach people.

Each recipient's settings (prefs.py) decide the channels: an inbox row in
the app, a Telegram message (when the bot is linked), an email (when SMTP
is configured and the account has an address). Delivery never raises —
a failing channel must not undo the action that triggered it.
"""

import logging
import threading

from django.conf import settings
from django.core.mail import send_mail
from django.db import close_old_connections

from common.audit import notify_user

from .models import Notification
from .prefs import CHANNELS, channels_for_users

logger = logging.getLogger(__name__)


def _brand() -> str:
    return str(getattr(settings, 'PLATFORM_NAME', '') or 'Platforma')


def _send_emails(batch):
    def run():
        try:
            for address, subject, text in batch:
                try:
                    send_mail(subject, text, settings.DEFAULT_FROM_EMAIL, [address], fail_silently=True)
                except Exception:
                    logger.exception('Failed to send notification email')
        finally:
            close_old_connections()

    threading.Thread(target=run, daemon=True).start()


def notify(users, kind, title, body='', url='', *, telegram_text=None, channels=CHANNELS, data=None, dedupe_key=''):
    """Deliver one event to one user or many.

    channels   — narrows which channels this event may use at all (e.g. an
                 admin-only heads-up that already has its own Telegram
                 feed passes ('app',)); the user's settings narrow further.
    dedupe_key — a generated message (birthday, announcement) is created at
                 most once per user for the same key.
    """
    if users is None:
        return []
    users = [u for u in (users if isinstance(users, (list, tuple, set)) else [users]) if u is not None]
    if not users:
        return []
    prefs = channels_for_users([u.id for u in users])
    rows, emails = [], []
    email_on = bool(getattr(settings, 'EMAIL_ENABLED', False))
    for user in users:
        allowed = prefs[user.id][str(kind)]
        if 'app' in channels and allowed['app']:
            rows.append(Notification(
                user=user, kind=kind, title=title[:200], body=body, url=url[:300],
                data=data or {}, dedupe_key=dedupe_key,
            ))
        if 'telegram' in channels and allowed['telegram']:
            notify_user(user, telegram_text or (f'{title}\n{body}' if body else title))
        if 'email' in channels and allowed['email'] and email_on and user.email:
            emails.append((user.email, f'{_brand()}: {title}', f'{title}\n\n{body}'.strip()))
    created = []
    if rows:
        try:
            created = Notification.objects.bulk_create(rows, ignore_conflicts=bool(dedupe_key))
        except Exception:
            logger.exception('Failed to store notifications')
    if emails:
        _send_emails(emails)
    return created
