from django.conf import settings
from django.db import models


class JournalClass(models.Model):
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='classes', on_delete=models.CASCADE)
    # Free text as typed by the teacher — kept for display/history. The
    # partner school it belongs to is `partner_school`, set from the
    # journal's school picker or matched automatically (schools/signals.py).
    school = models.CharField(max_length=255, blank=True)
    partner_school = models.ForeignKey(
        'schools.School', related_name='classes', null=True, blank=True, on_delete=models.SET_NULL,
    )
    name = models.CharField(max_length=100)  # e.g. "8-A"
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.teacher})'


class Student(models.Model):
    journal_class = models.ForeignKey(JournalClass, related_name='students', on_delete=models.CASCADE)
    full_name = models.CharField(max_length=255)
    order = models.PositiveSmallIntegerField(default=0)
    # Soft-delete: removing a student from the roster must not orphan
    # their historical grades/attendance rows (old system's positional
    # index scheme had no such safeguard — see migration plan §2.3).
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.full_name


class ClassDay(models.Model):
    journal_class = models.ForeignKey(JournalClass, related_name='days', on_delete=models.CASCADE)
    date = models.DateField()
    chorak = models.PositiveSmallIntegerField()
    topic = models.CharField(max_length=500, blank=True)

    class Meta:
        unique_together = ('journal_class', 'date')
        ordering = ['date']

    def __str__(self):
        return f'{self.journal_class} {self.date}'


class GradeEntry(models.Model):
    student = models.ForeignKey(Student, related_name='grades', on_delete=models.CASCADE)
    day = models.ForeignKey(ClassDay, related_name='grades', on_delete=models.CASCADE)
    mark = models.PositiveSmallIntegerField(choices=[(i, i) for i in range(1, 6)])

    class Meta:
        unique_together = ('student', 'day')


class AttendanceEntry(models.Model):
    class Status(models.TextChoices):
        SABABLI = 's', 'Sababli'
        SABABSIZ = 'n', 'Sababsiz'
        KECH = 'k', 'Kech'

    student = models.ForeignKey(Student, related_name='attendance', on_delete=models.CASCADE)
    day = models.ForeignKey(ClassDay, related_name='attendance', on_delete=models.CASCADE)
    status = models.CharField(max_length=1, choices=Status.choices)

    class Meta:
        unique_together = ('student', 'day')


class FinalGrade(models.Model):
    student = models.ForeignKey(Student, related_name='finals', on_delete=models.CASCADE)
    chorak = models.PositiveSmallIntegerField()
    mark = models.PositiveSmallIntegerField(choices=[(i, i) for i in range(1, 6)])

    class Meta:
        unique_together = ('student', 'chorak')
