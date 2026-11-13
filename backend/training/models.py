"""Malaka oshirish — the teachers' retraining courses.

  Course          — what the administration builds; its hours go on the
                    certificate
  Module          — one step of a course: its lessons, then a test. Passing
                    the test (Course.pass_percent) opens the next module
  CourseLesson    — one reading of a module: text, an external video link,
                    further links
  Enrollment      — a teacher on a course: started by themselves, or
                    assigned (with a deadline) by the administration
  LessonDone      — the teacher's "O'qidim" on a lesson
  TrainingAttempt — one graded run through a module's test, graded the way
                    learning.Attempt is (learning/grading.py snapshots)
  Certificate     — issued once every module is passed; its code lets
                    anyone check it at /verify/<code>
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class Course(models.Model):
    class Audience(models.TextChoices):
        ALL = 'all', "Barcha o'qituvchilar"
        MAKTAB = 'maktab', "Maktab o'qituvchilari"
        MUHANDIS = 'muhandis', "Muhandis D o'qituvchilari"

    title = models.CharField(max_length=200)
    summary = models.TextField(blank=True)
    # 0: not printed on the certificate
    hours = models.PositiveSmallIntegerField(default=0)
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.ALL)
    pass_percent = models.PositiveSmallIntegerField(default=70)
    is_published = models.BooleanField(default=False)
    order = models.PositiveSmallIntegerField(default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


class Module(models.Model):
    course = models.ForeignKey(Course, related_name='modules', on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    order = models.PositiveSmallIntegerField(default=0)
    # The module's test, in learning.Question's shape (kind, text, options,
    # correct, answer_value, tolerance_pct, unit, explanation, points…),
    # validated by learning's question serializer. Empty: no test — the
    # module is passed once its lessons are read.
    questions = models.JSONField(default=list, blank=True)
    # how many questions one attempt draws from the bank (0: all of them)
    test_size = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return f'{self.course}: {self.title}'


class CourseLesson(models.Model):
    module = models.ForeignKey(Module, related_name='lessons', on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    # External links only (YouTube / Drive / mp4) — nothing uploaded here.
    video_url = models.URLField(max_length=500, blank=True)
    # [{"title": "...", "url": "https://..."}]
    links = models.JSONField(default=list, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.title


class Enrollment(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='training_enrollments', on_delete=models.CASCADE)
    course = models.ForeignKey(Course, related_name='enrollments', on_delete=models.CASCADE)
    # set when the administration assigned the course (else self-started)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    due_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    # deadline reminders already sent (days before: 3, 1, 0)
    reminded = models.JSONField(default=list, blank=True)

    class Meta:
        unique_together = ('user', 'course')
        ordering = ['-created_at']


class LessonDone(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='+', on_delete=models.CASCADE)
    lesson = models.ForeignKey(CourseLesson, related_name='done_marks', on_delete=models.CASCADE)
    done_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'lesson')


class TrainingAttempt(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='training_attempts', on_delete=models.CASCADE)
    module = models.ForeignKey(Module, related_name='attempts', on_delete=models.CASCADE)
    started_at = models.DateTimeField(default=timezone.now)
    submitted_at = models.DateTimeField(null=True, blank=True)
    # Server-only until submitted (correct answers live here) — see
    # learning/grading.py.
    snapshot = models.JSONField(default=list, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    results = models.JSONField(default=dict, blank=True)
    score = models.FloatField(default=0)
    max_score = models.FloatField(default=0)
    percent = models.FloatField(default=0)
    duration_sec = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']
        indexes = [models.Index(fields=['user', 'module'])]


class Certificate(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='training_certificates', on_delete=models.CASCADE)
    # kept when the course is deleted later: the certificate stays valid
    course = models.ForeignKey(Course, related_name='certificates', null=True, blank=True, on_delete=models.SET_NULL)
    course_title = models.CharField(max_length=200)
    name = models.CharField(max_length=150)
    hours = models.PositiveSmallIntegerField(default=0)
    percent = models.FloatField(default=0)
    number = models.CharField(max_length=20, unique=True)  # "2026-00001"
    code = models.CharField(max_length=16, unique=True)    # what /verify/<code> looks up
    issued_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-issued_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'course'], name='training_one_certificate_per_course'),
        ]

    def __str__(self):
        return f'№{self.number} {self.name} — {self.course_title}'
