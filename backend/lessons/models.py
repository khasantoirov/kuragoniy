from django.db import models


class Lesson(models.Model):
    class Grade(models.TextChoices):
        G1_2 = '1-2', "1-2-sinf"
        G3_4 = '3-4', "3-4-sinf"
        G5_6 = '5-6', "5-6-sinf"
        G7 = '7', "7-sinf"
        G8_9 = '8-9', "8-9-sinf"
        # Amaliy fizika — one grade each, codes kept apart from STEAM's
        # groups (common/subjects.py)
        F7 = 'F7', "7-sinf (fizika)"
        F8 = 'F8', "8-sinf (fizika)"
        F9 = 'F9', "9-sinf (fizika)"

    class Category(models.TextChoices):
        """Amaliy fizika's bo'limlar (as on amaliyfizika.uz); STEAM lessons
        leave it blank."""
        MEXANIKA = 'mexanika', 'Mexanika'
        TERMODINAMIKA = 'termodinamika', 'Termodinamika'
        ELEKTR = 'elektr', 'Elektr'
        OPTIKA = 'optika', 'Optika'
        BOSHQA = 'boshqa', 'Boshqa'

    title = models.CharField(max_length=255)
    title_ru = models.CharField(max_length=255, blank=True)
    title_en = models.CharField(max_length=255, blank=True)

    grade = models.CharField(max_length=5, choices=Grade.choices)
    chorak = models.PositiveSmallIntegerField(choices=[(1, 1), (2, 2), (3, 3), (4, 4)])
    hafta = models.PositiveSmallIntegerField()
    cat = models.CharField(max_length=20, choices=Category.choices, blank=True, default='')

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
    # the Fizika window's virtual lab (frontend features/lab SIMS[id]), not an FK
    sim_id = models.CharField(max_length=64, blank=True)

    updated_at = models.DateTimeField(auto_now=True)
    translated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['grade', 'chorak', 'hafta']

    def __str__(self):
        return self.title

    @property
    def subject(self) -> str:
        from common.subjects import subject_of_grade

        return subject_of_grade(self.grade)


class EquipmentSheet(models.Model):
    """A generated "Kerakli jihozlar / Tavsif" table image (see
    frontend/src/features/admin/EquipmentSheetPage.tsx), saved server-side
    when an admin clicks "Galereyaga saqlash" — a permanent gallery, so a
    finished sheet doesn't only live in one person's Downloads folder."""

    grade = models.CharField(max_length=5, choices=Lesson.Grade.choices)
    hafta = models.PositiveSmallIntegerField()
    title = models.CharField(max_length=255, blank=True)
    image = models.FileField(upload_to='equipment-sheets/')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['grade', 'hafta', '-created_at']

    def __str__(self):
        return f'{self.grade}-sinf, {self.hafta}-hafta — {self.title}'


class QuarterLock(models.Model):
    """Admin-controlled visibility gate for the Lessons page, per fan
    (common/subjects.py) — each fan opens its own quarters. All 4 quarters
    are lockable; a missing row means chorak 1 defaults open (its original
    behaviour before it became lockable too) and 2-4 default closed, until
    an admin explicitly sets each one here."""

    subject = models.CharField(max_length=10, choices=[('fizika', 'Amaliy fizika'), ('steam', 'STEAM / Robototexnika')],
                               default='steam')
    chorak = models.PositiveSmallIntegerField(choices=[(1, 1), (2, 2), (3, 3), (4, 4)])
    is_open = models.BooleanField(default=False)

    class Meta:
        ordering = ['subject', 'chorak']
        constraints = [models.UniqueConstraint(fields=['subject', 'chorak'], name='quarterlock_one_per_subject')]

    def __str__(self):
        return f'{self.subject} {self.chorak}-chorak: {"ochiq" if self.is_open else "yopiq"}'


class Experiment(models.Model):
    class Type(models.TextChoices):
        """Amaliy fizika's experiment kinds; STEAM's practical tasks keep the
        default and the frontend doesn't show it for them."""
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
    steps = models.JSONField(default=list, blank=True)
    steps_ru = models.JSONField(default=list, blank=True)
    steps_en = models.JSONField(default=list, blank=True)
    # O'rganiladigan tushunchalar (concepts covered) — same list-of-strings
    # shape as materials/steps, not to be confused with steps ("Bajarish
    # tartibi" — an ordered how-to), since it holds unordered concept bullets.
    concepts = models.JSONField(default=list, blank=True)
    concepts_ru = models.JSONField(default=list, blank=True)
    concepts_en = models.JSONField(default=list, blank=True)

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


class EquipmentItem(models.Model):
    """A single piece of lab equipment an experiment needs, with how many
    and (optionally) a reference photo. Replaces the old flat
    Experiment.materials string list — see migration 0013 for the
    data-preserving upgrade. Image is deliberately read-only on the
    serializer and written only via EquipmentItemViewSet.upload_image,
    the same reason Lesson.file/LibraryItem.file work that way: a row
    needs a real persisted id before a file can be attached to it."""

    experiment = models.ForeignKey(Experiment, related_name='equipment_items', on_delete=models.CASCADE)
    order = models.PositiveSmallIntegerField(default=0)

    name = models.CharField(max_length=255)
    name_ru = models.CharField(max_length=255, blank=True)
    name_en = models.CharField(max_length=255, blank=True)

    quantity = models.PositiveIntegerField(default=1)

    image = models.FileField(upload_to='equipment-images/', null=True, blank=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.experiment.name} — {self.name} ({self.quantity})'
