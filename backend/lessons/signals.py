import contextlib
import logging
import threading

from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Lesson

logger = logging.getLogger(__name__)

_local = threading.local()


def is_backup_suppressed() -> bool:
    return getattr(_local, 'depth', 0) > 0


@contextlib.contextmanager
def suppress_lessons_backup():
    """Scoped guard for bulk operations (e.g. LessonViewSet.bulk_import):
    backup_lessons_on_change no-ops for every Lesson create/delete inside
    this block, however many there are — the caller is expected to call
    send_lessons_backup() itself exactly once after the block exits, if
    anything actually changed. Depth-counted so nested use stays safe.

    A thread-local flag rather than signal.disconnect()/reconnect() — the
    latter is process-global, so a concurrent request's own lesson save
    during another request's suppression window would silently lose its
    backup."""
    _local.depth = getattr(_local, 'depth', 0) + 1
    try:
        yield
    finally:
        _local.depth -= 1


def send_lessons_backup():
    """Public entry point for callers outside the signal itself (e.g. after
    a suppress_lessons_backup() block) — defers the same way the signal
    does."""
    transaction.on_commit(lambda: threading.Thread(target=_build_and_send_lessons_backup, daemon=True).start())


@receiver(post_save, sender=Lesson)
def queue_translation_job(sender, instance: Lesson, created, **kwargs):
    """Creates/reuses a pending TranslationJob and pushes it to the bot
    process via Channels whenever a lesson's content changes and hasn't
    been translated since — replaces the old Firestore onSnapshot +
    translatedAt<updatedAt comparison (see telegrambot/models.py)."""
    if instance.translated_at and instance.translated_at >= instance.updated_at:
        return

    from telegrambot.models import TranslationJob

    job, _ = TranslationJob.objects.get_or_create(
        lesson=instance,
        status=TranslationJob.Status.PENDING,
    )

    from realtime.broadcast import notify_translation_job
    notify_translation_job(job.id, instance.id)


def _build_and_send_lessons_backup():
    from django.db import close_old_connections

    from common.audit import send_document_to_admins

    from .backup import build_lessons_backup

    try:
        payload, filename = build_lessons_backup()
        when = timezone.localtime().strftime('%d.%m.%Y %H:%M:%S')
        send_document_to_admins(
            filename, payload, f"🗂 Darslar zaxirasi — {when}",
            content_type='application/json', include_boshliq=False,
        )
    except Exception:
        logger.exception('Failed to build/send on-edit lessons backup')
    finally:
        close_old_connections()


@receiver(post_save, sender=Lesson)
@receiver(post_delete, sender=Lesson)
def backup_lessons_on_change(sender, **kwargs):
    """Sends the full lessons JSON dump to every linked admin/dev-superuser's
    Telegram (not boshliq — this backup is admin-only) on every lesson
    create/edit/delete — independent of (and much more frequent than)
    telegrambot.bot.lessons_backup's 24-hour scheduled backup, so a backup
    always exists from right before *and* right after any change, not just
    once a day.

    Nested experiment changes (LessonSerializer._sync_experiments) don't
    need their own signal here: they only ever run from inside
    LessonSerializer.update(), which already saves the parent Lesson
    first — so one edit still fires this exactly once, not once per
    experiment touched.

    Deferred to transaction.on_commit (and off onto a thread from there)
    so the query behind it never races the caller's still-open
    transaction, and building+serializing every lesson never adds latency
    to the save request itself."""
    if is_backup_suppressed():
        return
    send_lessons_backup()
