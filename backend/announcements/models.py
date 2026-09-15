from django.conf import settings
from django.db import models


class Announcement(models.Model):
    text = models.TextField()
    at = models.DateTimeField(auto_now_add=True)
    by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ['-at']

    def __str__(self):
        return self.text[:60]
