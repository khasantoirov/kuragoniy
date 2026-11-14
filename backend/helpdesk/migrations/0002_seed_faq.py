from django.db import migrations


def seed(apps, schema_editor):
    from helpdesk.seed import FAQ

    FaqItem = apps.get_model('helpdesk', 'FaqItem')
    if FaqItem.objects.exists():
        return
    FaqItem.objects.bulk_create([
        FaqItem(category=cat, question=q, answer=a, order=i) for i, (cat, q, a) in enumerate(FAQ)
    ])


class Migration(migrations.Migration):
    dependencies = [('helpdesk', '0001_initial')]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
