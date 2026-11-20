"""Fizika and STEAM are separate windows (2026-11-20). Every library item
made before the subject existed was Ko'ragoniy's own STEAM material (the
physics books came in later from amaliyfizika.uz already marked 'fizika'),
so a blank subject — "both windows" — becomes 'steam'."""

from django.db import migrations


def forwards(apps, schema_editor):
    apps.get_model('library', 'LibraryItem').objects.filter(subject='').update(subject='steam')


class Migration(migrations.Migration):

    dependencies = [
        ('library', '0004_libraryitem_subject'),
    ]

    operations = [
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
