from django.conf import settings
from django.db import models

from .scales import level as level_of


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
    # The school's grading scale for this class: marks go 0..scale
    # (journal/scales.py maps them to colour bands).
    scale = models.PositiveSmallIntegerField(choices=[(5, '0-5'), (10, '0-10'), (100, '0-100')], default=5)
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
    # Lesson of the day ("4-soat"), as the teacher picked it on the day page.
    period = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ('journal_class', 'date')
        ordering = ['date']

    def __str__(self):
        return f'{self.journal_class} {self.date}'


class GradeEntry(models.Model):
    student = models.ForeignKey(Student, related_name='grades', on_delete=models.CASCADE)
    day = models.ForeignKey(ClassDay, related_name='grades', on_delete=models.CASCADE)
    # On the class's scale (0..journal_class.scale). `level` is its colour
    # band on a common 0-5 footing — 5 a'lo, 4 yaxshi, 3 qoniqarli,
    # 2 qoniqarsiz, 1/0 yomon — kept with it for colours and statistics.
    mark = models.PositiveSmallIntegerField()
    level = models.PositiveSmallIntegerField(default=0)

    class Meta:
        unique_together = ('student', 'day')

    def save(self, *args, **kwargs):
        self.level = level_of(self.mark, self.day.journal_class.scale)
        super().save(*args, **kwargs)


class AttendanceEntry(models.Model):
    class Status(models.TextChoices):
        SABABLI = 's', 'Sababli'          # older records; the day page no longer offers it
        SABABSIZ = 'n', 'Kelmadi'
        KECH = 'k', 'Kech'
        # At school but skipped this lesson — counted as an unexcused absence.
        KIRMADI = 'x', 'Kirmadi'

    student = models.ForeignKey(Student, related_name='attendance', on_delete=models.CASCADE)
    day = models.ForeignKey(ClassDay, related_name='attendance', on_delete=models.CASCADE)
    status = models.CharField(max_length=1, choices=Status.choices)

    class Meta:
        unique_together = ('student', 'day')


class FinalGrade(models.Model):
    student = models.ForeignKey(Student, related_name='finals', on_delete=models.CASCADE)
    chorak = models.PositiveSmallIntegerField()
    # Same as GradeEntry: on the class's scale, with its colour band.
    mark = models.PositiveSmallIntegerField()
    level = models.PositiveSmallIntegerField(default=0)

    class Meta:
        unique_together = ('student', 'chorak')

    def save(self, *args, **kwargs):
        self.level = level_of(self.mark, self.student.journal_class.scale)
        super().save(*args, **kwargs)


class JournalEditGrant(models.Model):
    """Permission to change a past day's marks and attendance. A teacher
    may only edit the lesson day itself (journal/locks.py); anything older
    needs one of these — asked for by the teacher and approved, or given
    directly by an administrator — and it works until `expires_at`."""

    class Status(models.TextChoices):
        PENDING = 'pending', 'Kutilmoqda'
        APPROVED = 'approved', 'Ruxsat berilgan'
        REJECTED = 'rejected', 'Rad etilgan'
        REVOKED = 'revoked', 'Bekor qilingan'

    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='journal_grants', on_delete=models.CASCADE)
    # Empty = every class of this teacher.
    journal_class = models.ForeignKey(
        JournalClass, related_name='edit_grants', null=True, blank=True, on_delete=models.CASCADE,
    )
    date_from = models.DateField()
    date_to = models.DateField()
    reason = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['teacher', 'status'])]

    def __str__(self):
        return f'{self.teacher} {self.date_from}–{self.date_to} ({self.status})'
