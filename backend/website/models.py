"""The public site (kuragoniy.uz's landing page): what the administration
fills in — contacts, photos, pupils' words, the teachers shown — and the
"leave your number" requests visitors send. Figures (schools, teachers,
pupils, lessons) come live from the platform unless an override is set."""

from django.conf import settings
from django.db import models


class SiteSettings(models.Model):
    """One row (pk=1): contacts, social links, the "why us" video, and
    optional overrides of the live figures."""

    phone = models.CharField(max_length=40, blank=True)
    email = models.CharField(max_length=120, blank=True)
    address = models.CharField(max_length=300, blank=True)
    telegram = models.CharField(max_length=200, blank=True)
    instagram = models.CharField(max_length=200, blank=True)
    youtube = models.CharField(max_length=200, blank=True)
    facebook = models.CharField(max_length=200, blank=True)
    video_url = models.URLField(blank=True)
    stat_schools = models.PositiveIntegerField(null=True, blank=True)
    stat_teachers = models.PositiveIntegerField(null=True, blank=True)
    stat_pupils = models.PositiveIntegerField(null=True, blank=True)
    stat_lessons = models.PositiveIntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls) -> 'SiteSettings':
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class LandingPhoto(models.Model):
    image = models.FileField(upload_to='site/photos/')
    caption = models.CharField(max_length=200, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']


class Testimonial(models.Model):
    """O'quvchilarimiz va ustozlarimiz fikrlari."""

    name = models.CharField(max_length=120)
    subtitle = models.CharField(max_length=200, blank=True)  # "9-sinf o'quvchisi, Iftixor School"
    text = models.TextField(max_length=1200)
    photo = models.FileField(upload_to='site/people/', null=True, blank=True)
    video_url = models.URLField(blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']


class Mentor(models.Model):
    """Tajribali ustozlarimiz."""

    name = models.CharField(max_length=120)
    title = models.CharField(max_length=200, blank=True)  # "Fizika o'qituvchisi, oliy toifa"
    bio = models.TextField(max_length=600, blank=True)
    photo = models.FileField(upload_to='site/people/', null=True, blank=True)
    order = models.PositiveSmallIntegerField(default=0)
    published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']


class Lead(models.Model):
    """"Ma'lumot qoldiring" — a visitor asking to be called back."""

    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=32)
    telegram = models.CharField(max_length=64, blank=True)
    message = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    handled_at = models.DateTimeField(null=True, blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name='+',
                                   on_delete=models.SET_NULL)
    note = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering = ['-created_at']
