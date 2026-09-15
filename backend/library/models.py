from django.db import models


class LibraryItem(models.Model):
    class Kind(models.TextChoices):
        KITOB = 'kitob', 'Kitob'
        QOLLANMA = 'qollanma', 'Qo\'llanma'
        VIDEO = 'video', 'Video'
        HAVOLA = 'havola', 'Havola'

    title = models.CharField(max_length=255)
    # Either an external link (required for video/havola — see the "no
    # video upload, disk is too tight" decision) or an uploaded file for
    # kitob/qollanma (see LibraryItemViewSet.upload_file); exactly one is
    # expected to be set, enforced by the frontend form per kind.
    url = models.URLField(blank=True)
    file = models.FileField(upload_to='library-files/', null=True, blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    grade = models.PositiveSmallIntegerField(null=True, blank=True)
    note = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title
