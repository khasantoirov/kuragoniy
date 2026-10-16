from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from telegrambot.backup import decrypt_bytes


class Command(BaseCommand):
    help = "Decrypts a '.enc' database backup (as sent to Telegram) with BACKUP_ENCRYPTION_KEY."

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--key", help="Defaults to BACKUP_ENCRYPTION_KEY from the environment.")
        parser.add_argument("--out", help="Output path (default: input without .enc).")

    def handle(self, *args, **options):
        import os

        from cryptography.fernet import InvalidToken

        src = Path(options["path"])
        key = (options.get("key") or os.environ.get("BACKUP_ENCRYPTION_KEY", "")).strip()
        if not key:
            raise CommandError("Kalit topilmadi: --key bering yoki BACKUP_ENCRYPTION_KEY ni o'rnating.")
        out = Path(options["out"]) if options.get("out") else src.with_suffix("") if src.suffix == ".enc" else src.with_name(src.name + ".dec")
        try:
            out.write_bytes(decrypt_bytes(src.read_bytes(), key.encode()))
        except InvalidToken:
            raise CommandError("Kalit noto'g'ri yoki fayl buzilgan.")
        self.stdout.write(self.style.SUCCESS(f"Ochildi: {out}"))
