"""Nishonlar — badges earned from what people already do on the platform
(achievements/badges.py says which and how). Only the highest tier reached
is stored, so a badge never disappears when data is tidied later."""

from django.conf import settings
from django.db import models


class UserBadge(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='badges', on_delete=models.CASCADE)
    key = models.CharField(max_length=32)
    tier = models.PositiveSmallIntegerField(default=1)  # 1 bronza, 2 kumush, 3 oltin
    earned_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'key')
        ordering = ['-earned_at']


class BadgeBaseline(models.Model):
    """Set the first time someone's badges are counted: everything earned
    before it is awarded quietly (no flood of notifications on the day the
    feature arrives); every tier after it is announced."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='+', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
