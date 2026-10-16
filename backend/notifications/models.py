"""Per-user notification inbox and each user's notification settings.

Notification     — one message in a user's inbox ("Bildirishnomalar"):
                   unread until opened, can be archived. `dedupe_key`
                   makes generated messages (birthdays, announcements)
                   idempotent per user.
NotificationPreference
                 — which channel (in the app, Telegram, email) each kind
                   of event uses, plus the appearance settings that follow
                   the user across devices (theme, bottom bar).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q


class Kind(models.TextChoices):
    ELON = 'elon', "E'lonlar"
    HISOBOT = 'hisobot', 'Dars hisobotlari'
    RAGBAT = 'ragbat', "Rag'batlantirish"
    OQUVCHI = 'oquvchi', "O'quvchilar"
    VAZIFA = 'vazifa', 'Vazifalar'
    TUGILGAN = 'tugilgan', "Tug'ilgan kunlar"
    XAVFSIZLIK = 'xavfsizlik', 'Kirish va xavfsizlik'
    DOKON = 'dokon', "Do'kon"
    JAMOA = 'jamoa', 'Jamoa'
    TIZIM = 'tizim', 'Tizim'


class Notification(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='notifications', on_delete=models.CASCADE)
    kind = models.CharField(max_length=16, choices=Kind.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    url = models.CharField(max_length=300, blank=True)
    # Free-form extras the UI needs to render a richer view (e.g. the
    # colleague's name for a birthday greeting). Never trusted for access.
    data = models.JSONField(default=dict, blank=True)
    dedupe_key = models.CharField(max_length=120, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['user', 'archived_at', 'created_at'])]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'dedupe_key'], condition=~Q(dedupe_key=''), name='notification_unique_dedupe_per_user',
            ),
        ]

    def __str__(self):
        return f'{self.user_id} · {self.kind} · {self.title}'


class NotificationPreference(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='notification_prefs', on_delete=models.CASCADE)
    # {kind: {"app": bool, "telegram": bool, "email": bool}} — only the
    # values the user changed; prefs.py fills in the defaults.
    channels = models.JSONField(default=dict, blank=True)
    # Appearance settings synced across the user's devices (see
    # frontend store/uiStore.ts — theme mode, bottom bar layout).
    ui = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'prefs · {self.user_id}'
