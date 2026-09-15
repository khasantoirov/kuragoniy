"""Fire-and-forget Telegram DM to every admin-level user (admin, boshliq,
dev-superuser) whenever one of them creates, edits, or deletes core
content — so the whole admin team has visibility into who changed what
without checking the database directly.

Sends straight to the Bot API from the web process (not via the
Channels-group pattern lessons/announcements use for broadcasting to many
clients) since the only consumer here is the developer's own chat, not the
frontend or the bot's long-polling process — a plain HTTPS call is simpler
and keeps working even if the bot process is temporarily down.
"""

import html
import json
import logging
import os
import threading
import urllib.request

import requests
from django.utils import timezone

logger = logging.getLogger(__name__)


def _admin_chat_ids(include_boshliq: bool = True) -> list[int]:
    from django.db.models import Q

    from accounts.models import User

    roles = [User.Role.ADMIN, User.Role.BOSHLIQ] if include_boshliq else [User.Role.ADMIN]
    return list(
        User.objects.filter(telegram_linked=True)
        .filter(Q(is_dev_superuser=True) | Q(role__in=roles))
        .exclude(telegram_chat_id__isnull=True)
        .values_list('telegram_chat_id', flat=True)
    )


def _actor_label(user) -> str:
    if user is None or not getattr(user, 'is_authenticated', False):
        return "Noma'lum"
    role = user.get_role_display() if hasattr(user, 'get_role_display') else ''
    label = f"{user.name} ({role})" if role else user.name
    return html.escape(label)


_MAX_VALUE_LEN = 160


def _fmt_value(v) -> str:
    if isinstance(v, (list, tuple)):
        v = ', '.join(str(x) for x in v)
    if v in (None, ''):
        return "(bo'sh)"
    v = str(v)
    return v if len(v) <= _MAX_VALUE_LEN else v[:_MAX_VALUE_LEN] + '…'


def snapshot(instance, fields) -> dict:
    """Captures the current value of each of `fields` on `instance` — call
    this *before* mutating/saving so it holds the "before" state to diff
    against afterwards."""
    return {f: getattr(instance, f) for f in fields}


def diff_fields(before: dict, after_instance, fields, labels: dict | None = None) -> str:
    """One "• Label: old → new" line per field that actually changed
    between `before` (from an earlier `snapshot()` call) and the current
    values on `after_instance`; unchanged fields are omitted. `labels`
    maps a field name to a human label — fields missing from it fall back
    to the raw field name."""
    labels = labels or {}
    lines = []
    for f in fields:
        old, new = before.get(f), getattr(after_instance, f)
        if old != new:
            lines.append(f"• {labels.get(f, f)}: {_fmt_value(old)} → {_fmt_value(new)}")
    return '\n'.join(lines)


def _compose_message(actor, text: str, when: str) -> str:
    # `text` is built by callers from user-editable content (titles, names,
    # announcement bodies via diff_fields/_fmt_value) — a bare '<' or '&' in
    # there breaks Telegram's HTML parser and silently drops the whole
    # notification for every admin, so it must be escaped, not just the
    # actor label.
    return f"🛠 <b>{_actor_label(actor)}</b> · {when}\n{html.escape(text)}"


def notify_admin_action(actor, text: str) -> None:
    """`text` is the already-worded description of what happened, e.g.
    "Dars qo'shdi: «Elektr toki» (8-sinf, 2-chorak)". Delivered to every
    admin-level user (role admin/boshliq, or is_dev_superuser) with a
    linked Telegram account, including the actor themself — this is a
    full audit log for the whole admin team, not just a heads-up about
    *other* admins' changes."""
    token = os.environ.get('BOT_TOKEN')
    if not token:
        return

    when = timezone.localtime().strftime('%d.%m %H:%M')
    message = _compose_message(actor, text, when)

    def run():
        # Best-effort only: nothing here should ever surface to the caller
        # (a request thread that has already saved/returned) or to a test
        # run — a DB row briefly locked by the caller's own transaction is
        # expected, not a bug, so the whole body is one broad try/except
        # rather than just wrapping the network call.
        from django.db import close_old_connections
        try:
            for chat_id in _admin_chat_ids():
                body = json.dumps({'chat_id': chat_id, 'text': message, 'parse_mode': 'HTML'}).encode()
                req = urllib.request.Request(
                    f'https://api.telegram.org/bot{token}/sendMessage',
                    data=body,
                    headers={'Content-Type': 'application/json'},
                    method='POST',
                )
                urllib.request.urlopen(req, timeout=5)
            close_old_connections()
        except Exception:
            logger.exception('Failed to notify dev via Telegram')

    threading.Thread(target=run, daemon=True).start()


def send_document_to_admins(
    filename: str,
    payload: bytes,
    caption: str,
    content_type: str = 'application/octet-stream',
    include_boshliq: bool = True,
) -> None:
    """Fire-and-forget file upload (a lessons JSON backup, a full-database
    backup, etc.) to every admin-level user's Telegram — same delivery
    model as notify_admin_action (direct Bot API call from the web
    process, so it keeps working even if the bot's own long-polling
    process is down). Uses `requests` (already a pinned dependency)
    rather than hand-rolling multipart/form-data over urllib, which
    notify_admin_action's plain JSON body doesn't need.

    `include_boshliq=False` (used by the lessons JSON backup) skips the
    boshliq role — that backup is admin/dev-superuser-only, unlike the
    full-database backup and the general admin-action audit log, which
    still reach boshliq too."""
    token = os.environ.get('BOT_TOKEN')
    if not token:
        return

    def run():
        from django.db import close_old_connections
        try:
            for chat_id in _admin_chat_ids(include_boshliq=include_boshliq):
                requests.post(
                    f'https://api.telegram.org/bot{token}/sendDocument',
                    data={'chat_id': chat_id, 'caption': caption},
                    files={'document': (filename, payload, content_type)},
                    timeout=30,
                )
            close_old_connections()
        except Exception:
            logger.exception('Failed to send document via Telegram')

    threading.Thread(target=run, daemon=True).start()
