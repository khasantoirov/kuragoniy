from django.core.management.base import BaseCommand
from django.utils import timezone

from telegrambot.backup import clean_old_backups, run_backup


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

    def handle(self, *args, **options):
        path = run_backup(compress=not options["no_compress"])
        removed = clean_old_backups(keep_days=options["keep_days"])
        self.stdout.write(self.style.SUCCESS(f"Backup saved: {path}"))
        if removed:
            self.stdout.write(f"Removed {removed} backup(s) older than {options['keep_days']} days.")

        if not options["no_telegram"]:
            from common.audit import send_document_to_admins

            size_kb = path.stat().st_size / 1024
            when = timezone.localtime().strftime('%d.%m.%Y %H:%M')
            send_document_to_admins(
                path.name,
                path.read_bytes(),
                f"💾 To'liq ma'lumotlar bazasi zaxirasi — {when} ({size_kb:.0f} KB)",
                content_type='application/gzip' if path.suffix == '.gz' else 'application/x-sqlite3',
            )
            self.stdout.write("Sent to Telegram admins.")
