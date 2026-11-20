"""Fizika and STEAM are separate windows (2026-11-20). The retraining
courses made before the subject existed were Ko'ragoniy's STEAM courses, so
a blank subject — "both windows" — becomes 'steam'."""

from django.db import migrations


def forwards(apps, schema_editor):
    apps.get_model('training', 'Course').objects.filter(subject='').update(subject='steam')


class Migration(migrations.Migration):

    dependencies = [
        ('training', '0002_course_subject'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
