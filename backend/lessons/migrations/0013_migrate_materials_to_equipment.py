from django.db import migrations


def migrate_materials(apps, schema_editor):
    Experiment = apps.get_model('lessons', 'Experiment')
    EquipmentItem = apps.get_model('lessons', 'EquipmentItem')
    for exp in Experiment.objects.all():
        names = exp.materials or []
        names_ru = exp.materials_ru or []
        names_en = exp.materials_en or []
        for i, name in enumerate(names):
            if not isinstance(name, str) or not name.strip():
                continue
            EquipmentItem.objects.create(
                experiment=exp,
                order=i,
                name=name.strip(),
                quantity=1,
                name_ru=names_ru[i] if i < len(names_ru) and isinstance(names_ru[i], str) else '',
                name_en=names_en[i] if i < len(names_en) and isinstance(names_en[i], str) else '',
            )


class Migration(migrations.Migration):

    dependencies = [
        ('lessons', '0012_equipmentitem'),
    ]

    # One-way content upgrade — reconstructing materials[] from EquipmentItem
    # rows isn't needed, the old field is removed outright in the next
    # migration once this data has landed.
    operations = [
        migrations.RunPython(migrate_materials, migrations.RunPython.noop),
    ]
