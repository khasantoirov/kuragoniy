"""Student portal + classroom workflow.

  ClassInvite     — join code a student types to register into a class
  StudentProfile  — student account <-> journal class (and roster row)
  LessonMaterial  — student-facing theory / formulas / video for a Lesson
  Question        — one bank for everything: student practice/homework
                    questions and the teacher readiness check
  Assignment      — "darsni topshirish": a teacher hands a lesson/test to
                    a class with a deadline
  Attempt         — one graded run through a question set (practice,
                    homework, or a teacher's readiness check)
  LessonProgress  — what a student has opened/watched/finished
  LessonReport    — "dars hisoboti": a teacher reports a lesson they gave,
                    administration rates it
  Award           — rag'batlantirish (student of the month, best lesson…)

Lesson (lessons app) is referenced, never modified, so the existing
lessons/experiments screens keep working exactly as before.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

# Ko'ragoniy Edu: sinf guruhlari darslar bilan bir xil (Lesson.Grade).
GRADE_CHOICES = [('1-2', '1-2-sinf'), ('3-4', '3-4-sinf'), ('5-6', '5-6-sinf'), ('7', '7-sinf'), ('8-9', '8-9-sinf')]


class ClassInvite(models.Model):
    journal_class = models.OneToOneField('journal.JournalClass', related_name='invite', on_delete=models.CASCADE)
    code = models.CharField(max_length=12, unique=True)
    is_active = models.BooleanField(default=True)
    # Self-registered students wait for their teacher's approval unless
    # the teacher turns this on (e.g. while everyone signs up in class).
    auto_approve = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.journal_class} [{self.code}]'


class StudentProfile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='student_profile', on_delete=models.CASCADE)
    journal_class = models.ForeignKey(
        'journal.JournalClass', related_name='student_profiles', null=True, blank=True, on_delete=models.SET_NULL,
    )
    # The journal roster row this account belongs to (when created from
    # the roster), so journal marks and portal results line up.
    roster_entry = models.OneToOneField(
        'journal.Student', related_name='account', null=True, blank=True, on_delete=models.SET_NULL,
    )
    grade = models.CharField(max_length=5, choices=GRADE_CHOICES, null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.user} ({self.journal_class})'


class LessonMaterial(models.Model):
    lesson = models.OneToOneField('lessons.Lesson', related_name='material', on_delete=models.CASCADE)
    theory = models.TextField(blank=True)
    # [{"expr": "F = m*a", "desc": "Nyutonning ikkinchi qonuni"}, ...]
    formulas = models.JSONField(default=list, blank=True)
    # External links only (YouTube / Vimeo / Google Drive / direct mp4) —
    # nothing is uploaded to this server.
    video_url = models.URLField(max_length=500, blank=True)
    # [{"title": "...", "url": "https://..."}]
    extra_videos = models.JSONField(default=list, blank=True)
    is_published = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )

    def __str__(self):
        return f'Material: {self.lesson}'


class Question(models.Model):
    class Kind(models.TextChoices):
        TEST = 'test', 'Test (bitta javob)'
        MULTI = 'multi', "Test (bir nechta javob)"
        NUMBER = 'number', 'Masala (son javob)'
        TEXT = 'text', "Qisqa javob"

    class Audience(models.TextChoices):
        STUDENT = 'student', "O'quvchi"
        TEACHER = 'teacher', "O'qituvchi (tayyorgarlik)"

    class Topic(models.TextChoices):
        NAZARIYA = 'nazariya', 'Nazariya'
        FORMULA = 'formula', 'Formula'
        TAJRIBA = 'tajriba', 'Tajriba'
        MASALA = 'masala', 'Masala'

    lesson = models.ForeignKey('lessons.Lesson', related_name='questions', null=True, blank=True, on_delete=models.CASCADE)
    # Teacher-authored extra questions that belong to one assignment only.
    assignment = models.ForeignKey(
        'Assignment', related_name='custom_questions', null=True, blank=True, on_delete=models.CASCADE,
    )
    audience = models.CharField(max_length=10, choices=Audience.choices, default=Audience.STUDENT)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.TEST)
    topic = models.CharField(max_length=10, choices=Topic.choices, default=Topic.NAZARIYA)

    text = models.TextField()
    image_url = models.URLField(max_length=500, blank=True)
    options = models.JSONField(default=list, blank=True)  # list[str] for test/multi
    # test: [index]; multi: [indexes]; text: [accepted answers]
    correct = models.JSONField(default=list, blank=True)
    # number: the expected value and allowed relative error (percent)
    answer_value = models.FloatField(null=True, blank=True)
    tolerance_pct = models.FloatField(default=2.0)
    unit = models.CharField(max_length=32, blank=True)
    explanation = models.TextField(blank=True)
    points = models.PositiveSmallIntegerField(default=1)
    order = models.PositiveSmallIntegerField(default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order', 'id']
        indexes = [models.Index(fields=['lesson', 'audience'])]

    def __str__(self):
        return self.text[:60]


class Assignment(models.Model):
    class ShowAnswers(models.TextChoices):
        AFTER_SUBMIT = 'after_submit', 'Topshirgandan keyin'
        AFTER_DUE = 'after_due', "Muddat tugagach"
        NEVER = 'never', "Ko'rsatilmasin"

    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='assignments', on_delete=models.CASCADE)
    journal_class = models.ForeignKey('journal.JournalClass', related_name='assignments', on_delete=models.CASCADE)
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=255)
    instructions = models.TextField(blank=True)
    include_lesson_questions = models.BooleanField(default=True)
    due_at = models.DateTimeField(null=True, blank=True)
    max_attempts = models.PositiveSmallIntegerField(default=1)
    show_answers = models.CharField(max_length=16, choices=ShowAnswers.choices, default=ShowAnswers.AFTER_SUBMIT)
    is_published = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['journal_class', '-created_at'])]

    def __str__(self):
        return self.title

    @property
    def is_overdue(self):
        return bool(self.due_at and self.due_at < timezone.now())


class Attempt(models.Model):
    class Kind(models.TextChoices):
        PRACTICE = 'practice', "Mustaqil mashq"
        HOMEWORK = 'homework', 'Uyga vazifa'
        READINESS = 'readiness', "O'qituvchi tayyorgarligi"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='attempts', on_delete=models.CASCADE)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    assignment = models.ForeignKey(Assignment, related_name='attempts', null=True, blank=True, on_delete=models.CASCADE)
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)

    started_at = models.DateTimeField(default=timezone.now)
    submitted_at = models.DateTimeField(null=True, blank=True)
    is_late = models.BooleanField(default=False)

    # Server-only: the exact questions served, with correct answers and the
    # option shuffle applied — graded against this, never against the live
    # bank (which an admin may have edited since), and never sent to the
    # client before submission.
    snapshot = models.JSONField(default=list, blank=True)
    answers = models.JSONField(default=dict, blank=True)
    results = models.JSONField(default=dict, blank=True)

    score = models.FloatField(default=0)
    max_score = models.FloatField(default=0)
    percent = models.FloatField(default=0)
    duration_sec = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['user', 'kind', '-started_at']),
            models.Index(fields=['assignment', 'user']),
            models.Index(fields=['kind', 'submitted_at']),
        ]

    def __str__(self):
        return f'{self.user} {self.kind} {self.percent:.0f}%'


class LessonProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='lesson_progress', on_delete=models.CASCADE)
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', on_delete=models.CASCADE)
    opened_at = models.DateTimeField(auto_now_add=True)
    theory_done = models.BooleanField(default=False)
    video_done = models.BooleanField(default=False)
    best_percent = models.FloatField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('user', 'lesson')


class LessonReport(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = 'submitted', "Topshirildi"
        REVIEWED = 'reviewed', "Baholandi"
        RETURNED = 'returned', "Qaytarildi"

    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='lesson_reports', on_delete=models.CASCADE)
    journal_class = models.ForeignKey(
        'journal.JournalClass', related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    date = models.DateField()
    topic = models.CharField(max_length=255)
    summary = models.TextField()
    methods = models.TextField(blank=True)
    students_present = models.PositiveSmallIntegerField(null=True, blank=True)
    students_total = models.PositiveSmallIntegerField(null=True, blank=True)
    # External photo/video links only — nothing uploaded to the server.
    media_links = models.JSONField(default=list, blank=True)
    readiness_attempt = models.ForeignKey(Attempt, related_name='+', null=True, blank=True, on_delete=models.SET_NULL)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.SUBMITTED)
    rating = models.PositiveSmallIntegerField(null=True, blank=True)  # 1..5
    review_comment = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [models.Index(fields=['teacher', '-date']), models.Index(fields=['status'])]

    def __str__(self):
        return f'{self.teacher} {self.date} {self.topic}'


class Award(models.Model):
    class Kind(models.TextChoices):
        STUDENT_OF_MONTH = 'student_of_month', "Oyning eng yaxshi o'quvchisi"
        BEST_LESSON = 'best_lesson', 'Eng yaxshi dars'
        TOP_TEACHER = 'top_teacher', "Eng faol o'qituvchi"
        CUSTOM = 'custom', "Boshqa rag'bat"

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='awards', on_delete=models.CASCADE)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.CUSTOM)
    title = models.CharField(max_length=200)
    reason = models.TextField(blank=True)
    period = models.CharField(max_length=32, blank=True)  # e.g. "2026-10" or "1-chorak"
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, related_name='+', null=True, blank=True, on_delete=models.SET_NULL,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.title} → {self.recipient}'
