from django.conf import settings
from django.db import models


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

    class Meta:
        unique_together = ('teacher', 'day_index', 'period_index')
        ordering = ['day_index', 'period_index']

    def __str__(self):
        return f'{self.teacher_id} {self.day_index}:{self.period_index}'
