"""Keeps journal classes and teacher memberships attached to partner
schools as data comes in — a class typed as "Sodiq school" lands on the
right School without anyone running the linking tool again."""

from django.core.cache import cache
from django.db.models.signals import post_delete, post_save, pre_save
from django.dispatch import receiver

from journal.models import JournalClass
from timetable.models import TimetableSlot

from .matching import find_school
from .models import School, SchoolTeacher

STATS_GENERATION_KEY = 'schools:gen'


def bump_stats_cache(**kwargs):
    """Structural changes (schools, links, memberships, classes) must show
    up immediately — stats responses are cached per generation, so bumping
    it retires every cached response at once."""
    try:
        cache.incr(STATS_GENERATION_KEY)
    except ValueError:
        cache.set(STATS_GENERATION_KEY, 1, None)


for _model in (School, SchoolTeacher, JournalClass):
    post_save.connect(bump_stats_cache, sender=_model, dispatch_uid=f'schools-gen-save-{_model.__name__}')
    post_delete.connect(bump_stats_cache, sender=_model, dispatch_uid=f'schools-gen-del-{_model.__name__}')


@receiver(pre_save, sender=JournalClass)
def auto_link_class(sender, instance, **kwargs):
    if instance.partner_school_id is None and instance.school:
        school = find_school(instance.school)
        if school:
            instance.partner_school = school


@receiver(post_save, sender=JournalClass)
def remember_class_teacher(sender, instance, **kwargs):
    if instance.partner_school_id:
        SchoolTeacher.objects.get_or_create(school_id=instance.partner_school_id, teacher_id=instance.teacher_id)


@receiver(post_save, sender=TimetableSlot)
def remember_timetable_teacher(sender, instance, **kwargs):
    if instance.maktab:
        school = find_school(instance.maktab)
        if school:
            SchoolTeacher.objects.get_or_create(school=school, teacher_id=instance.teacher_id)
