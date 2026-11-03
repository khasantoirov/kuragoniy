"""Partner schools (hamkor maktablar) — the shared registry that journal
classes, teachers and statistics hang off.

Before this, a class's school was a free-text field, so the same school
showed up as "Sodiq School (Aeroport)", "Sodiq school", "Sodiq"... and no
per-school number could be trusted. A School keeps its official `name`
plus `aliases` (other spellings seen in the journal/timetable); matching.py
links free-text rows to the right School through either.
"""

from django.conf import settings
from django.db import models, transaction
from django.utils import timezone


class School(models.Model):
    name = models.CharField(max_length=200, unique=True)
    district = models.CharField(max_length=120, blank=True)  # tuman / shahar
    address = models.CharField(max_length=300, blank=True)
    director = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    contract_start = models.DateField(null=True, blank=True)
    contract_end = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    # Other spellings that should count as this school when matching the
    # journal's / timetable's free-text school names.
    aliases = models.JSONField(default=list, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class SchoolTeacher(models.Model):
    """A teacher assigned to a partner school (a teacher may work at
    several). Created by administration, or automatically when one of the
    teacher's journal classes / timetable slots is linked to the school."""

    school = models.ForeignKey(School, related_name='memberships', on_delete=models.CASCADE)
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='school_memberships', on_delete=models.CASCADE)
    since = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('school', 'teacher')
        ordering = ['school__name', 'teacher__name']

    def __str__(self):
        return f'{self.teacher} @ {self.school}'


def school_year_of(day) -> int:
    """The o'quv yili a date falls in, as its first calendar year. Classes
    are set up from August, so 2026-08-25 and 2027-05-20 are both 2026."""
    return day.year if day.month >= 8 else day.year - 1


class AcademicYear(models.Model):
    """O'quv yili — 2026-2027 is start_year 2026. Every journal class
    belongs to one (JournalClass.year); exactly one is current: where new
    classes go and what the pages show unless another year is picked."""

    start_year = models.PositiveSmallIntegerField(unique=True)
    is_current = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-start_year']

    def __str__(self):
        return self.name

    @property
    def name(self):
        return f'{self.start_year}-{self.start_year + 1}'

    @classmethod
    def current(cls):
        year = cls.objects.filter(is_current=True).first()
        if year is None:  # a fresh database: the year today falls in
            year, _ = cls.objects.get_or_create(start_year=school_year_of(timezone.localdate()))
            year.make_current()
        return year

    def is_past(self):
        return self.start_year < AcademicYear.current().start_year

    @classmethod
    def from_param(cls, raw):
        """?year=<id> from a request, or the current year."""
        if raw and str(raw).isdigit():
            year = cls.objects.filter(pk=int(raw)).first()
            if year:
                return year
        return cls.current()

    @transaction.atomic
    def make_current(self):
        AcademicYear.objects.exclude(pk=self.pk).filter(is_current=True).update(is_current=False)
        AcademicYear.objects.filter(pk=self.pk).update(is_current=True)
        self.is_current = True
        # School.is_active is "a partner this year" — now this year's.
        active = set(self.school_years.filter(is_active=True).values_list('school_id', flat=True))
        School.objects.filter(pk__in=active).update(is_active=True)
        School.objects.exclude(pk__in=active).update(is_active=False)


class SchoolYear(models.Model):
    """Whether a school is a partner in one o'quv yili. A school with no
    row for a year isn't one that year. School.is_active mirrors the
    current year's row, so everything that asks "a partner now?" still
    reads that one field."""

    school = models.ForeignKey(School, related_name='school_years', on_delete=models.CASCADE)
    year = models.ForeignKey(AcademicYear, related_name='school_years', on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ('school', 'year')
        ordering = ['year__start_year']

    def __str__(self):
        return f'{self.school} {self.year}: {"faol" if self.is_active else "faol emas"}'

    @classmethod
    def set(cls, school, year, active):
        cls.objects.update_or_create(school=school, year=year, defaults={'is_active': active})
        if year.is_current and school.is_active != active:
            School.objects.filter(pk=school.pk).update(is_active=active)
            school.is_active = active

    @classmethod
    def start(cls, school):
        """A new school: a partner from the current year on, as its own
        is_active says."""
        current = AcademicYear.current()
        for year in AcademicYear.objects.filter(start_year__gte=current.start_year):
            cls.objects.get_or_create(school=school, year=year, defaults={'is_active': school.is_active})

    @classmethod
    def carry_over(cls, source, target):
        """A newly added year starts with the partners of `source`."""
        for row in cls.objects.filter(year=source):
            cls.objects.get_or_create(school_id=row.school_id, year=target, defaults={'is_active': row.is_active})
