from django.conf import settings
from django.db import models


class PushSubscription(models.Model):
    """One browser/device Web Push subscription. A teacher may be
    subscribed from several devices at once, so this is a separate table
    rather than fields on User (mirrors the one-endpoint-per-browser
    contract of the Push API itself)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='push_subscriptions')
    endpoint = models.URLField(max_length=500, unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user_id} · {self.endpoint[:40]}'
