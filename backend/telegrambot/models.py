from django.db import models


class BotMeta(models.Model):
    """Small key/value store for bot process state, e.g. the
    'initialized' flag that guards against blasting pre-existing
    announcements to Telegram on first deploy (see Milestone 6)."""

    key = models.CharField(max_length=64, unique=True)
    value = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return self.key


class TranslationJob(models.Model):
    """Durable work queue for the bot's lesson-translation worker,
    replacing the old Firestore onSnapshot + translatedAt<updatedAt
    comparison. A row is created/reset by lessons/signals.py whenever a
    Lesson is saved; the bot process consumes pending jobs via the
    'translation_jobs' Channels group (see realtime/broadcast.py)."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        RUNNING = 'running', 'Running'
        DONE = 'done', 'Done'
        ERROR = 'error', 'Error'

    lesson = models.ForeignKey('lessons.Lesson', related_name='translation_jobs', on_delete=models.CASCADE)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    requested_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)

    class Meta:
        ordering = ['-requested_at']

    def __str__(self):
        return f'{self.lesson_id} [{self.status}]'
