from django.conf import settings
from django.db import models

from common.subjects import CHOICES as SUBJECT_CHOICES


class Announcement(models.Model):
    text = models.TextField()
    at = models.DateTimeField(auto_now_add=True)
    by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    # Kimga: '' everyone (both fan windows), or one window only
    fan = models.CharField(max_length=10, choices=SUBJECT_CHOICES, blank=True, default='')

    class Meta:
        ordering = ['-at']

    def __str__(self):
        return self.text[:60]
