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


class VapidKeys(models.Model):
    """The server's VAPID key pair, for when it is not supplied through env.

    backend/.env is owned by www-data (mode 620) and the deploy user cannot
    write it, so the keys cannot be provisioned there from a deploy. The
    database is something the deploy already writes to (migrate), so
    `manage.py generate_vapid_keys --db` stores the pair here instead.
    Keys in the environment still win — see webpush.keys.get_vapid_keys().

    A single row (primary key fixed at 1): there is one key pair, and the
    fixed key makes "create if missing" race-safe through get_or_create."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    public_key = models.CharField(max_length=128)
    private_key = models.CharField(max_length=128)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'VAPID keys'

    def __str__(self):
        return f'VAPID keys created {self.created_at:%Y-%m-%d}'
