"""Jadval katagi hamkor maktabga bog'lanadi (ro'yxatdan tanlanadi).

Bor kataklar: maktab nomi FAOL hamkor maktabning rasmiy nomi yoki
muqobil nomiga (aliases) aniq mos kelsa, shu maktabga bog'lanadi va nomi
rasmiy nomga keltiriladi. Mos kelmaganlari (va "band" kataklar) tegilmaydi —
ularni ma'muriyat "Hamkor maktablar" bo'limida moslashtiradi."""

import re

import django.db.models.deletion
from django.db import migrations, models


def _norm(text):
    s = str(text or '').lower()
    s = re.sub(r"[ʻʼ‘’`´]", "'", s)
    s = re.sub(r'\s*([()])\s*', r'\1', s)
    return re.sub(r'\s+', ' ', s).strip()


def link_existing(apps, schema_editor):
    School = apps.get_model('schools', 'School')
    Slot = apps.get_model('timetable', 'TimetableSlot')
    index = {}
    for school in School.objects.filter(is_active=True).order_by('name'):
        for key in [school.name, *(school.aliases or [])]:
            if _norm(key):
                index.setdefault(_norm(key), school)
    for slot in Slot.objects.filter(band=False, school__isnull=True).exclude(maktab=''):
        school = index.get(_norm(slot.maktab))
        if school:
            slot.school = school
            slot.maktab = school.name
            slot.save(update_fields=['school', 'maktab'])


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0008_academic_year_quarters'),
        ('timetable', '0004_remove_timetableslot_lesson_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='timetableslot',
            name='school',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                    related_name='timetable_slots', to='schools.school'),
        ),
        migrations.RunPython(link_existing, migrations.RunPython.noop),
    ]
