from django.conf import settings
from django.db import models

from common.subjects import CHOICES as SUBJECT_CHOICES


class TimetableSlot(models.Model):
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='timetable_slots', on_delete=models.CASCADE)
    day_index = models.PositiveSmallIntegerField()   # 0-4 Mon-Fri
    period_index = models.PositiveSmallIntegerField()  # 1-8

    time_from = models.TimeField(null=True, blank=True)
    time_to = models.TimeField(null=True, blank=True)
    # The partner school, picked from the list the administration keeps
    # (Hamkor maktablar); `maktab` then carries its name. A "band" slot
    # (busy elsewhere) and an old free-text one not yet matched have none.
    school = models.ForeignKey('schools.School', related_name='timetable_slots', null=True, blank=True,
                               on_delete=models.SET_NULL)
    maktab = models.CharField(max_length=255, blank=True)  # school's name (free text only for "band")
    xona = models.CharField(max_length=64, blank=True)      # room
    sinf = models.CharField(max_length=64, blank=True)      # class
    span = models.PositiveSmallIntegerField(default=1)
    band = models.BooleanField(default=False)  # "busy elsewhere" placeholder, not a real lesson
    # the fan window it belongs to (common/subjects.py) — Fizika and STEAM
    # keep their journals apart
    subject = models.CharField(max_length=10, choices=SUBJECT_CHOICES, default='steam', db_index=True)

    class Meta:
        unique_together = ('teacher', 'day_index', 'period_index')
        ordering = ['day_index', 'period_index']

    def __str__(self):
        return f'{self.teacher_id} {self.day_index}:{self.period_index}'


class SchoolBells(models.Model):
    """A school's own lesson times (its bell schedule), entered by a teacher
    who works there or by the administration. Every lesson in that school's
    timetable — any teacher's — takes its times from here (timetable/bells.py).

    times = {"*": {"1": ["08:00", "08:45"], …}, "4": {"6": ["14:30", "15:10"]}}
    "*" is every school day; a weekday's own map ("0" Monday … "4" Friday)
    is for a day that runs differently, e.g. Friday. A period missing from a
    day's own map falls back to "*"."""

    school = models.OneToOneField('schools.School', related_name='bells', on_delete=models.CASCADE)
    times = models.JSONField(default=dict, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='+')
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.school_id} bells'

    def period(self, day_index: int, period_index: int):
        """[from, to] as "HH:MM" strings, or None."""
        own = (self.times.get(str(day_index)) or {}).get(str(period_index))
        return own or (self.times.get('*') or {}).get(str(period_index))
