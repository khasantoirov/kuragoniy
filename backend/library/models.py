from django.db import models

from common.subjects import CHOICES as SUBJECT_CHOICES


class LibraryItem(models.Model):
    class Kind(models.TextChoices):
        KITOB = 'kitob', 'Kitob'
        QOLLANMA = 'qollanma', 'Qo\'llanma'
        VIDEO = 'video', 'Video'
        HAVOLA = 'havola', 'Havola'

    class Lang(models.TextChoices):
        UZ = 'uz', "O'zbekcha"
        RU = 'ru', 'Ruscha'
        EN = 'en', 'Inglizcha'

    class Section(models.TextChoices):
        PLATFORMA = 'platforma', 'Platformadan foydalanish'
        METODIKA = 'metodika', "Metodik qo'llanmalar"
        XAVFSIZLIK = 'xavfsizlik', 'Jihozlar xavfsizligi'

    title = models.CharField(max_length=255)
    # Either an external link (required for video/havola — see the "no
    # video upload, disk is too tight" decision) or an uploaded file for
    # kitob/qollanma (see LibraryItemViewSet.upload_file); exactly one is
    # expected to be set, enforced by the frontend form per kind.
    url = models.URLField(blank=True)
    file = models.FileField(upload_to='library-files/', null=True, blank=True)
    # Front cover shown on the bookcase, for any kind (see
    # LibraryItemViewSet.upload_cover). The client sends it already shrunk.
    cover = models.FileField(upload_to='library-covers/', null=True, blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    grade = models.PositiveSmallIntegerField(null=True, blank=True)
    # the fan it belongs to; blank = both (common/subjects.py)
    subject = models.CharField(max_length=10, choices=SUBJECT_CHOICES, blank=True)
    note = models.TextField(blank=True)
    # the material's language (Kutubxona's "Til" filter)
    lang = models.CharField(max_length=2, choices=Lang.choices, default=Lang.UZ)
    # Qo'llanmalar markazi: which part of it a guide (or a video) belongs in;
    # blank = not a guide for teachers, just a library item
    section = models.CharField(max_length=12, choices=Section.choices, blank=True)
    # how many times it was opened, read or downloaded — once per person a
    # day (LibraryItemViewSet.opened); "Eng ko'p ochilganlar"
    opens = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title
