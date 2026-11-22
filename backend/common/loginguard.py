"""Password spraying from one address: the per-account lock-out (5 wrong
passwords → 15 minutes) stops guessing at ONE account, but a script can
try one or two passwords on each of many accounts and never trip it.

So every wrong password is also counted per IP — by the *logins* tried,
not the attempts. When one address has failed on LOGIN_IP_THRESHOLD
different logins within LOGIN_IP_WINDOW_MINUTES, password sign-in from it
stops for LOGIN_IP_BLOCK_MINUTES and the administration hears about it on
Telegram (once per block).

A whole class signs in from behind one school address, so the threshold
is well above what a class mistyping passwords reaches, and the block
covers the password form only: sign-in by phone (a code through our
Telegram bot) keeps working for everyone behind that address.
"""

import time

from django.conf import settings
from django.core.cache import cache

from .security import client_ip, log_event

BLOCKED = ("Bu tarmoqdan juda ko'p noto'g'ri parol kiritildi. {minutes} daqiqadan keyin qayta urining "
           "yoki telefon raqam orqali kiring.")


def _window() -> int:
    return int(getattr(settings, 'LOGIN_IP_WINDOW_MINUTES', 15)) * 60


def _block() -> int:
    return int(getattr(settings, 'LOGIN_IP_BLOCK_MINUTES', 15)) * 60


def _threshold() -> int:
    return int(getattr(settings, 'LOGIN_IP_THRESHOLD', 25))


def blocked_minutes(request) -> int:
    """Minutes left of this address's block (0 = not blocked)."""
    ip = client_ip(request)
    if not ip:
        return 0
    until = cache.get(f'ke:ipblock:{ip}')
    left = (until or 0) - time.time()
    return max(1, int(left // 60) + 1) if left > 0 else 0


def note_failed_login(request, login: str) -> bool:
    """Counts a wrong password from this address; True when that just
    blocked it."""
    ip = client_ip(request)
    if not ip:
        return False
    now = time.time()
    key = f'ke:ipfail:{ip}'
    tried = {k: t for k, t in (cache.get(key) or {}).items() if now - t < _window()}
    tried[(login or '').strip().lower()[:80]] = now
    cache.set(key, tried, _window())
    if len(tried) < _threshold() or cache.get(f'ke:ipblock:{ip}'):
        return False
    cache.set(f'ke:ipblock:{ip}', now + _block(), _block())
    cache.delete(key)
    log_event('login_ip_blocked', request=request, detail=f'IP {ip}: {len(tried)} ta turli login')
    _tell_admins(ip, len(tried))
    return True


def _tell_admins(ip: str, logins: int) -> None:
    from .audit import _admin_chat_ids, send_telegram_message

    minutes = _block() // 60
    text = ("🛡 KO'RAGONIY EDU: parol terish hujumi to'xtatildi\n\n"
            f"🌐 IP: {ip}\n"
            f"👥 {logins} ta turli loginga noto'g'ri parol kiritildi ({_window() // 60} daqiqada)\n"
            f"⏳ Shu manzildan parol bilan kirish {minutes} daqiqaga to'xtatildi "
            "(telefon orqali kirish ishlaydi).\n\n"
            "Batafsil: Boshqaruv → Xavfsizlik jurnali.")
    for chat_id in _admin_chat_ids():
        send_telegram_message(chat_id, text)
