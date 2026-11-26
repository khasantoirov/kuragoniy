"""Ustozlar xonasi — the teacher's day ahead, and guest teachers.

  PlannedLesson — the lesson a teacher picked for one of their timetable
                  hours on a given day (otherwise the calendar's guess)
  GuestRequest  — "mehmon ustoz chaqirish": a teacher asks Muhandis D for a
                  guest teacher at their class; the administration answers
"""

from django.conf import settings
from django.db import models

from common.subjects import CHOICES as SUBJECT_CHOICES


class PlannedLesson(models.Model):
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='planned_lessons', on_delete=models.CASCADE)
    date = models.DateField()
    period_index = models.PositiveSmallIntegerField()
    # null: the teacher cleared the guess ("no lesson from the plan")
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('teacher', 'date', 'period_index')


class GuestRequest(models.Model):
    class Status(models.TextChoices):
        NEW = 'yangi', 'Yangi'
        ACCEPTED = 'qabul', 'Qabul qilindi'
        DECLINED = 'rad', 'Rad etildi'
        DONE = 'otkazildi', "O'tkazildi"
        CANCELLED = 'bekor', 'Bekor qilindi'

    requester = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='guest_requests', on_delete=models.CASCADE)
    school = models.ForeignKey('schools.School', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    school_name = models.CharField(max_length=255, blank=True)
    class_name = models.CharField(max_length=64, blank=True)
    date = models.DateField()
    time = models.CharField(max_length=32, blank=True)  # "3-soat, 10:00"
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    topic = models.CharField(max_length=255, blank=True)
    note = models.TextField(blank=True)

    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    guest = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='guest_visits', null=True, blank=True,
                              on_delete=models.SET_NULL)
    reply = models.TextField(blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True,
                                   on_delete=models.SET_NULL)
    handled_at = models.DateTimeField(null=True, blank=True)
    # the fan window it was asked from ('' — older ones: both windows)
    fan = models.CharField(max_length=10, choices=SUBJECT_CHOICES, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['status', 'date'])]

    def __str__(self):
        return f'{self.requester} → {self.date} {self.class_name}'
