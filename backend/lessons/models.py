from django.db import models


class Lesson(models.Model):
    class Grade(models.TextChoices):
        G1_2 = '1-2', "1-2-sinf"
        G3_4 = '3-4', "3-4-sinf"
        G5_6 = '5-6', "5-6-sinf"
        G7_8 = '7-8', "7-8-sinf"
        G9 = '9', "9-sinf"

    title = models.CharField(max_length=255)
    title_ru = models.CharField(max_length=255, blank=True)
    title_en = models.CharField(max_length=255, blank=True)

    grade = models.CharField(max_length=3, choices=Grade.choices)
    chorak = models.PositiveSmallIntegerField(choices=[(1, 1), (2, 2), (3, 3), (4, 4)])
    hafta = models.PositiveSmallIntegerField()

    goal = models.TextField(blank=True)
    goal_ru = models.TextField(blank=True)
    goal_en = models.TextField(blank=True)

    # Two ways to attach a lesson's document: paste an external link (old
    # behaviour, kept for existing content and anyone who prefers a Drive
    # link), or upload a file directly to MEDIA_ROOT (see LessonViewSet
    # .upload_file — a dedicated action, since mixing a binary file with
    # this serializer's nested `experiments` JSON in one multipart request
    # isn't practical). The frontend prefers `file` for display when both
    # are set.
    file_url = models.URLField(blank=True)
    file = models.FileField(upload_to='lesson-files/', null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    translated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['grade', 'chorak', 'hafta']

    def __str__(self):
        return self.title


class QuarterLock(models.Model):
    """Admin-controlled visibility gate for the Lessons page. All 4 quarters
    are lockable; a missing row means chorak 1 defaults open (its original
    behaviour before it became lockable too) and 2-4 default closed, until
    an admin explicitly sets each one here."""

    chorak = models.PositiveSmallIntegerField(unique=True, choices=[(1, 1), (2, 2), (3, 3), (4, 4)])
    is_open = models.BooleanField(default=False)

    class Meta:
        ordering = ['chorak']

    def __str__(self):
        return f'{self.chorak}-chorak: {"ochiq" if self.is_open else "yopiq"}'


class Experiment(models.Model):
    lesson = models.ForeignKey(Lesson, related_name='experiments', on_delete=models.CASCADE)
    order = models.PositiveSmallIntegerField(default=0)

    name = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255, blank=True)
    name_en = models.CharField(max_length=255, blank=True)

    desc = models.TextField(blank=True)
    desc_ru = models.TextField(blank=True)
    desc_en = models.TextField(blank=True)

    # Parallel string-array fields (kept as JSON lists rather than fully
    # normalized child tables, since they're only ever rendered/edited as
    # a whole per experiment — see migration plan §1.3 for the trade-off).
    # _ru/_en are translated whole-list copies, written by the bot's
    # translation worker (telegrambot/bot/translation.py).
    materials = models.JSONField(default=list, blank=True)
    materials_ru = models.JSONField(default=list, blank=True)
    materials_en = models.JSONField(default=list, blank=True)
    steps = models.JSONField(default=list, blank=True)
    steps_ru = models.JSONField(default=list, blank=True)
    steps_en = models.JSONField(default=list, blank=True)

    minutes = models.PositiveSmallIntegerField(null=True, blank=True)

    safety = models.TextField(blank=True)
    safety_ru = models.TextField(blank=True)
    safety_en = models.TextField(blank=True)

    image = models.URLField(blank=True)
    video = models.URLField(blank=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.lesson.title} — {self.name}'
