from django.db import migrations, models


def split_band(apps, schema_editor):
    """'7-8-9' splits back into '7' (Elektronika) and '8-9' (Amaliy
    loyihalar), matching the five programs the About page now lists.

    Every existing lesson in the old band moves to '7': all 16 of them are
    electronics content (breadboard, resistors, transistors, logic gates),
    which is exactly the 7-sinf program. '8-9' — where students build their
    own projects — starts empty and gets filled by hand.

    No renumbering here, unlike 0009: nothing is being merged, so the band
    keeps its existing continuous hafta sequence and no two lessons can
    collide on (chorak, hafta)."""
    Lesson = apps.get_model('lessons', 'Lesson')
    Lesson.objects.filter(grade='7-8-9').update(grade='7')


def unsplit_band(apps, schema_editor):
    Lesson = apps.get_model('lessons', 'Lesson')
    Lesson.objects.filter(grade__in=['7', '8-9']).update(grade='7-8-9')


class Migration(migrations.Migration):

    dependencies = [
        ('lessons', '0010_experiment_concepts_experiment_concepts_en_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='lesson',
            name='grade',
            field=models.CharField(
                choices=[
                    ('1-2', '1-2-sinf'),
                    ('3-4', '3-4-sinf'),
                    ('5-6', '5-6-sinf'),
                    ('7', '7-sinf'),
                    ('8-9', '8-9-sinf'),
                ],
                max_length=5,
            ),
        ),
        # Reversible, but the reverse collapses 7 and 8-9 back together and
        # would need 0009-style renumbering if 8-9 ever holds lessons that
        # share a (chorak, hafta) slot with 7.
        migrations.RunPython(split_band, unsplit_band),
    ]
