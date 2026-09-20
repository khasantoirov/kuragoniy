"""Create the VAPID key pair web push needs, and optionally write it to .env.

Push notifications need VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (see
config/settings/base.py and webpush/send.py). Without them the browser
never gets an applicationServerKey, so "Push yoqish" can only fail.

Two modes:

* default — print both lines so they can be pasted into backend/.env.
* --write — put them into backend/.env directly, printing only the public
  key. This is what the deploy runs: the private key is generated on the
  server and lands in a file that never leaves it, so nobody has to see or
  copy it. It does nothing when keys are already configured, so it is safe
  to run on every deploy.

The public key must be the uncompressed P-256 point (87 chars), not the
DER/PEM py_vapid saves to disk, or pushManager.subscribe() rejects it —
that encoding is the part that is easy to get wrong by hand.

Replacing existing keys invalidates every subscription (each device would
have to enable push again), hence --force.
"""

import base64
import os
from pathlib import Path

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from py_vapid import Vapid01

KEYS = ('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY')
NL = '\n'


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


def _env_path() -> Path:
    return Path(settings.BASE_DIR) / '.env'


def _write_env(public: str, private: str) -> Path:
    """Replace any VAPID_* lines in .env with the new pair.

    Old entries are dropped rather than left above the new ones: systemd
    (EnvironmentFile) lets the last assignment win, but django-environ's
    read_env keeps the first, so a stale empty `VAPID_PUBLIC_KEY=` left in
    place would silently shadow the new key for one of the two readers.
    """
    path = _env_path()
    prefixes = tuple(f'{k}=' for k in KEYS)

    # Reading and writing sit in one try on purpose: a permission problem
    # usually shows up on the read first (the file belongs to another user),
    # and that has to surface as a clear, actionable message rather than a
    # raw traceback.
    try:
        lines = path.read_text(encoding='utf-8').splitlines() if path.exists() else []
        kept = [ln for ln in lines if not ln.lstrip().startswith(prefixes)]
        body = NL.join(kept).rstrip(NL)
        text = (body + NL if body else '') + f'VAPID_PUBLIC_KEY={public}{NL}VAPID_PRIVATE_KEY={private}{NL}'

        if path.exists():
            # Opening an existing file for write keeps its owner and mode.
            with open(path, 'w', encoding='utf-8', newline=NL) as fh:
                fh.write(text)
        else:
            # A brand-new .env holds secrets — owner-only from the start.
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8', newline=NL) as fh:
                fh.write(text)
    except OSError as exc:
        # No quote characters on purpose: this text ends up in the deploy
        # run's annotation, where quotes get escaped into noise.
        raise CommandError(
            f'{path} bilan ishlab bolmadi ({exc.strerror or exc}). '
            'Serverda root huquqi bilan qolda ishga tushiring: '
            'sudo ./venv/bin/python manage.py generate_vapid_keys --write'
        ) from exc

    return path


class Command(BaseCommand):
    help = 'Generate a VAPID key pair for web push (print it, or write it to backend/.env with --write).'

    def add_arguments(self, parser):
        parser.add_argument('--write', action='store_true',
                            help='Put the keys into backend/.env instead of printing the private key.')
        parser.add_argument('--force', action='store_true',
                            help='Replace keys that are already configured (invalidates every subscription).')

    def handle(self, *args, **options):
        configured = bool(settings.VAPID_PUBLIC_KEY and settings.VAPID_PRIVATE_KEY)
        if configured and not options['force']:
            self.stdout.write('VAPID keys are already configured — nothing to do.')
            return

        vapid = Vapid01()
        vapid.generate_keys()
        public = _b64(vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint))
        private = _b64(vapid.private_key.private_numbers().private_value.to_bytes(32, 'big'))

        if options['write']:
            path = _write_env(public, private)
            self.stdout.write(self.style.SUCCESS(f'VAPID keys written to {path}.'))
            self.stdout.write(f'Public key: {public}')
            self.stdout.write('Restart kuragoniy-backend and kuragoniy-bot to pick them up.')
            return

        self.stdout.write('Append these to backend/.env, then restart kuragoniy-backend:' + NL)
        self.stdout.write(f'VAPID_PUBLIC_KEY={public}')
        self.stdout.write(f'VAPID_PRIVATE_KEY={private}')
        self.stdout.write(self.style.WARNING(NL + 'The private key is a secret — keep it on the server only.'))
