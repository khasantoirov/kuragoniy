"""Yaxshi now starts at 70 out of 100 (was 71): marks of exactly 70 on a
0-100 class — and nazorat ishi results, always out of 100 — move from
qoniqarli (level 3) to yaxshi (level 4)."""

from django.db import migrations


def forwards(apps, schema_editor):
    apps.get_model('journal', 'GradeEntry').objects.filter(day__journal_class__scale=100, mark=70).update(level=4)
    apps.get_model('journal', 'FinalGrade').objects.filter(student__journal_class__scale=100, mark=70).update(level=4)
    apps.get_model('journal', 'ControlMark').objects.filter(mark=70).update(level=4)


def backwards(apps, schema_editor):
    apps.get_model('journal', 'GradeEntry').objects.filter(day__journal_class__scale=100, mark=70).update(level=3)
    apps.get_model('journal', 'FinalGrade').objects.filter(student__journal_class__scale=100, mark=70).update(level=3)
    apps.get_model('journal', 'ControlMark').objects.filter(mark=70).update(level=3)


class Migration(migrations.Migration):

    dependencies = [('journal', '0006_control_works')]

    operations = [migrations.RunPython(forwards, backwards)]
