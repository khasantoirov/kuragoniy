from django.core.management.base import BaseCommand
from django.utils import timezone

from telegrambot.backup import clean_old_backups, encrypt_bytes, encryption_key, run_backup


class Command(BaseCommand):
    help = (
        "Creates a compressed, online-safe SQLite backup under backups/ and "
        "sends it to every linked admin's Telegram — the only copy that "
        "isn't lost if this VPS's disk is. Schedule via OS cron/systemd timer."
    )

    def add_arguments(self, parser):
        parser.add_argument("--keep-days", type=int, default=30)
        parser.add_argument("--no-compress", action="store_true")
        parser.add_argument("--no-telegram", action="store_true", help="Skip sending the backup to Telegram.")
        parser.add_argument("--generate-key", action="store_true",
                            help="Print a new BACKUP_ENCRYPTION_KEY value and exit.")

    def handle(self, *args, **options):
        if options["generate_key"]:
            from cryptography.fernet import Fernet

            self.stdout.write(Fernet.generate_key().decode())
            return

        path = run_backup(compress=not options["no_compress"])
        self._prune_audit_log()
        removed = clean_old_backups(keep_days=options["keep_days"])
        self.stdout.write(self.style.SUCCESS(f"Backup saved: {path}"))
        if removed:
            self.stdout.write(f"Removed {removed} backup(s) older than {options['keep_days']} days.")

        if not options["no_telegram"]:
            from common.audit import send_document_to_admins

            payload = path.read_bytes()
            name = path.name
            content_type = 'application/gzip' if path.suffix == '.gz' else 'application/x-sqlite3'
            lock = ''
            if encryption_key():
                payload = encrypt_bytes(payload)
                name += '.enc'
                content_type = 'application/octet-stream'
                lock = '🔒 '
            else:
                self.stdout.write(self.style.WARNING(
                    "BACKUP_ENCRYPTION_KEY is not set — the Telegram copy is NOT encrypted."))
            size_kb = len(payload) / 1024
            when = timezone.localtime().strftime('%d.%m.%Y %H:%M')
            send_document_to_admins(
                name,
                payload,
                f"{lock}💾 To'liq ma'lumotlar bazasi zaxirasi — {when} ({size_kb:.0f} KB)",
                content_type=content_type,
            )
            self.stdout.write("Sent to Telegram admins.")

    def _prune_audit_log(self, keep_days: int = 400):
        from datetime import timedelta

        from common.models import AuditLog

        AuditLog.objects.filter(created_at__lt=timezone.now() - timedelta(days=keep_days)).delete()
