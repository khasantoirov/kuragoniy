from django.db import models


class Lesson(models.Model):
    class Grade(models.IntegerChoices):
        G7 = 7, '7-sinf'
        G8 = 8, '8-sinf'
        G9 = 9, '9-sinf'

    class Category(models.TextChoices):
        MEXANIKA = 'mexanika', 'Mexanika'
        TERMODINAMIKA = 'termodinamika', 'Termodinamika'
        ELEKTR = 'elektr', 'Elektr'
        OPTIKA = 'optika', 'Optika'
        BOSHQA = 'boshqa', 'Boshqa'

    title = models.CharField(max_length=255)
    title_ru = models.CharField(max_length=255, blank=True)
    title_en = models.CharField(max_length=255, blank=True)

    grade = models.PositiveSmallIntegerField(choices=Grade.choices)
    chorak = models.PositiveSmallIntegerField(choices=[(1, 1), (2, 2), (3, 3), (4, 4)])
    hafta = models.PositiveSmallIntegerField()
    cat = models.CharField(max_length=20, choices=Category.choices, default=Category.BOSHQA)

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
    sim_id = models.CharField(max_length=64, blank=True)  # references frontend lab SIMS[id], not an FK

    updated_at = models.DateTimeField(auto_now=True)
    translated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['grade', 'chorak', 'hafta']

    def __str__(self):
        return self.title


class LessonPoster(models.Model):
    """A generated "N-sinf · N-hafta · Mavzu: ..." experiment-grid image
    (see frontend/src/features/admin/LessonPosterPage.tsx), saved
    server-side the moment an admin exports one, so it stays available as
    a permanent gallery instead of only living in whoever's Downloads
    folder happened to click the button."""

    grade = models.PositiveSmallIntegerField(choices=Lesson.Grade.choices)
    hafta = models.PositiveSmallIntegerField()
    topic = models.CharField(max_length=255, blank=True)
    image = models.FileField(upload_to='lesson-posters/')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['grade', 'hafta', '-created_at']

    def __str__(self):
        return f'{self.grade}-sinf, {self.hafta}-hafta — {self.topic}'


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
    class Type(models.TextChoices):
        ODDIY = 'oddiy', 'Oddiy'
        WOW = 'wow', 'Wow'
        OYIN = 'oyin', "O'yin"

    lesson = models.ForeignKey(Lesson, related_name='experiments', on_delete=models.CASCADE)
    order = models.PositiveSmallIntegerField(default=0)

    name = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255, blank=True)
    name_en = models.CharField(max_length=255, blank=True)

    type = models.CharField(max_length=10, choices=Type.choices, default=Type.ODDIY)

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
