"""Who is online right now, and when someone was last active.

Every authenticated request (and a 60-second heartbeat from any open
tab) refreshes a per-user timestamp in the shared cache — Redis in
production, so this costs no database write. The database column
`User.last_seen_at` is only refreshed every few minutes, so "last seen"
survives a cache flush without turning 1000+ open tabs into a constant
stream of SQLite writes.

Online   = active within ONLINE_WINDOW and not logged out since.
Last seen = the latest of the cache stamp and the stored column (shown as
            hour:minute in the UI — "qachon chiqqan").
"""

from datetime import datetime, timedelta, timezone as dt_timezone

from django.core.cache import cache
from django.utils import timezone

ONLINE_WINDOW = timedelta(minutes=2)
DB_WRITE_EVERY = timedelta(minutes=5)
CACHE_TTL = 60 * 60 * 24 * 14


def _key(user_id) -> str:
    return f'presence:{user_id}'


def touch(user) -> None:
    """Never raises — presence must not break the request it rides on."""
    try:
        now = timezone.now()
        cache.set(_key(user.pk), now.timestamp(), CACHE_TTL)
        last = getattr(user, 'last_seen_at', None)
        if last is None or now - last > DB_WRITE_EVERY:
            type(user).objects.filter(pk=user.pk).update(last_seen_at=now)
            user.last_seen_at = now
    except Exception:
        pass


def mark_logged_out(user) -> None:
    try:
        now = timezone.now()
        type(user).objects.filter(pk=user.pk).update(logged_out_at=now, last_seen_at=now)
        cache.set(_key(user.pk), now.timestamp(), CACHE_TTL)
    except Exception:
        pass


def presence_for(users) -> dict:
    """{user_id: {'online': bool, 'last_seen': datetime | None}} in one
    cache round trip."""
    users = list(users)
    stamps = cache.get_many([_key(u.pk) for u in users]) if users else {}
    now = timezone.now()
    out = {}
    for u in users:
        ts = stamps.get(_key(u.pk))
        cached = datetime.fromtimestamp(ts, tz=dt_timezone.utc) if ts else None
        stored = getattr(u, 'last_seen_at', None)
        # last_login covers people who logged in before presence tracking
        # existed, so they don't show up as "never logged in".
        seen = max([d for d in (cached, stored, getattr(u, 'last_login', None)) if d], default=None)
        logged_out = getattr(u, 'logged_out_at', None)
        online = bool(seen and now - seen <= ONLINE_WINDOW and not (logged_out and logged_out >= seen))
        out[u.pk] = {'online': online, 'last_seen': seen}
    return out


def presence_of(user) -> dict:
    return presence_for([user])[user.pk]
