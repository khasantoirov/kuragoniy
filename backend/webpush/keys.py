"""Where the VAPID key pair comes from.

Environment first (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in .env), so an
operator who wants to manage the keys by hand can, and an existing setup
keeps working unchanged. Otherwise the VapidKeys row that
`manage.py generate_vapid_keys --db` created at deploy time.

Every consumer goes through here — the public-key endpoint the browser
subscribes with, the sender that signs with the private key, and the
dashboard's "is push set up" flag — so they can never disagree about
whether keys exist.
"""

from django.conf import settings

from .models import VapidKeys


def get_vapid_keys() -> tuple[str, str]:
    """(public, private); ('', '') when no complete pair is configured."""
    public, private = settings.VAPID_PUBLIC_KEY, settings.VAPID_PRIVATE_KEY
    if public and private:
        return public, private
    row = VapidKeys.objects.filter(pk=1).first()
    if row and row.public_key and row.private_key:
        return row.public_key, row.private_key
    return '', ''


def vapid_configured() -> bool:
    return all(get_vapid_keys())
