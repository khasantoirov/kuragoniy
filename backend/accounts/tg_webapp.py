"""Telegram Mini App — the platform opened inside @kuragoniybot (owner,
2026-11-28: "botda mini app qilaylik", "Telegram orqali avtomatik").

Telegram hands the app its `initData`: the Telegram user and a hash signed
with the bot's token. It is checked here exactly as Telegram describes
(https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
the secret is HMAC-SHA256 of the token under the key "WebAppData", and the
hash is HMAC-SHA256 of the sorted "key=value" lines under that secret. Only
then does the Telegram user id count — it names the account whose Telegram
is linked to it (User.telegram_chat_id; for a private chat with the bot the
chat id is the user id)."""

import hashlib
import hmac
import json
import os
import time
from urllib.parse import parse_qsl

# how old initData may be: a mini app left open over a day signs in again
MAX_AGE_SECONDS = 24 * 3600


def verify(init_data: str, *, token: str | None = None, now: float | None = None) -> dict | None:
    """The Telegram user ({'id', 'first_name', 'username', …}) of genuine,
    fresh initData; None otherwise."""
    token = token if token is not None else os.environ.get('BOT_TOKEN', '')
    if not token or not init_data or len(init_data) > 4096:
        return None
    try:
        pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=True))
    except ValueError:
        return None
    received = pairs.pop('hash', '')
    if not received:
        return None
    check = '\n'.join(f'{k}={v}' for k, v in sorted(pairs.items()))
    secret = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        return None
    try:
        auth_date = int(pairs.get('auth_date', '0'))
    except ValueError:
        return None
    if (now if now is not None else time.time()) - auth_date > MAX_AGE_SECONDS:
        return None
    try:
        user = json.loads(pairs.get('user', ''))
    except ValueError:
        return None
    if not isinstance(user, dict) or not isinstance(user.get('id'), int):
        return None
    return user
