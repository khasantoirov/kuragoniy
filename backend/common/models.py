from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    """Durable security/audit trail — logins (ok/failed/locked), password
    resets, role changes, account creation, admin actions. The Telegram DMs
    from common/audit.py are a live heads-up only; this table is what
    survives a lost chat history and what the "Xavfsizlik jurnali" screen
    reads."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    # Kept separately from the FK so a row stays readable after the actor
    # account is deleted.
    actor_label = models.CharField(max_length=200, blank=True)
    action = models.CharField(max_length=64, db_index=True)
    detail = models.TextField(blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M} {self.action} {self.actor_label}'


class PlatformSettings(models.Model):
    """Singleton (pk=1) — platform-wide switches the administration sets.
    `modules`: the optional sections (common/modules.py) as {key: bool}; a
    missing key means on."""

    modules = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
