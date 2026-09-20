"""Print a fresh VAPID key pair for .env.

Push notifications need VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (see
config/settings/base.py and webpush/send.py). Without them the browser
never gets an applicationServerKey, so "Push yoqish" can only fail.

Generating them by hand means a long py_vapid snippet and getting the
base64url encoding right — the public key must be the uncompressed P-256
point (87 chars), not the DER/PEM that py_vapid saves to disk, or
pushManager.subscribe() rejects it.

Run it on the server and append the two lines to backend/.env; the
private key is a secret, so don't paste the output into chat or a
ticket:

    sudo -u www-data ./venv/bin/python manage.py generate_vapid_keys
"""

import base64

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.conf import settings
from django.core.management.base import BaseCommand
from py_vapid import Vapid01


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')


class Command(BaseCommand):
    help = 'Generate a VAPID key pair for web push and print it in .env form.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Generate even though keys are already configured (invalidates every existing subscription).',
        )

    def handle(self, *args, **options):
        if settings.VAPID_PUBLIC_KEY and not options['force']:
            self.stdout.write(self.style.WARNING(
                'VAPID keys are already configured. Replacing them invalidates every existing\n'
                'subscription — every device would have to enable push again. Pass --force if\n'
                'that is what you want.'
            ))
            return

        vapid = Vapid01()
        vapid.generate_keys()

        public = _b64(vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint))
        private = _b64(vapid.private_key.private_numbers().private_value.to_bytes(32, 'big'))

        self.stdout.write('Append these to backend/.env, then restart kuragoniy-backend:\n')
        self.stdout.write(f'VAPID_PUBLIC_KEY={public}')
        self.stdout.write(f'VAPID_PRIVATE_KEY={private}')
        self.stdout.write(self.style.WARNING('\nThe private key is a secret — keep it on the server only.'))
