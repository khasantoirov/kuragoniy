"""STEM chamadonlar — the equipment kits Muhandis D gives schools.

  Kit        — one kit: its name, code, contents and how to use it
  KitItem    — a piece of equipment in it, matched to the lessons'
               equipment by lessons.models.equipment_key (the same match
               the "Jihozlar jadvali" uses), with how many
  SchoolKit  — the kits a partner school has
  KitRequest — a teacher (or the school's ma'muriyat) asks for a kit, or for
               the pieces a lesson still lacks; the administration answers
               (no payment here — that's agreed outside, see the shop)
"""

from django.conf import settings
from django.db import models


class Kit(models.Model):
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=32, blank=True)  # "MEX-7"
    description = models.TextField(blank=True)
    # Yo'riqnoma: how to unpack, use and put it away; a link to a PDF/video
    instructions = models.TextField(blank=True)
    instructions_url = models.URLField(max_length=500, blank=True)
    cover_url = models.URLField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class KitItem(models.Model):
    kit = models.ForeignKey(Kit, related_name='items', on_delete=models.CASCADE)
    key = models.CharField(max_length=255)   # lessons.models.equipment_key(name)
    name = models.CharField(max_length=255)
    quantity = models.PositiveIntegerField(default=1)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']
        unique_together = ('kit', 'key')

    def __str__(self):
        return f'{self.kit}: {self.name} ×{self.quantity}'


class SchoolKit(models.Model):
    school = models.ForeignKey('schools.School', related_name='kits', on_delete=models.CASCADE)
    kit = models.ForeignKey(Kit, related_name='schools', on_delete=models.CASCADE)
    quantity = models.PositiveSmallIntegerField(default=1)
    received_on = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        unique_together = ('school', 'kit')
        ordering = ['kit__name']


class KitRequest(models.Model):
    class Status(models.TextChoices):
        NEW = 'yangi', 'Yangi'
        ACCEPTED = 'qabul', 'Qabul qilindi'
        DECLINED = 'rad', 'Rad etildi'
        DELIVERED = 'yetkazildi', 'Yetkazildi'
        CANCELLED = 'bekor', 'Bekor qilindi'

    requester = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='kit_requests', on_delete=models.CASCADE)
    school = models.ForeignKey('schools.School', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    # a whole kit, or (kit empty) the pieces `lesson` still lacks
    kit = models.ForeignKey(Kit, related_name='requests', null=True, blank=True, on_delete=models.SET_NULL)
    quantity = models.PositiveSmallIntegerField(default=1)
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    # [{"name": "...", "quantity": 2}] — the pieces asked for
    items = models.JSONField(default=list, blank=True)
    note = models.TextField(blank=True)

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    reply = models.TextField(blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True,
                                   on_delete=models.SET_NULL)
    handled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
