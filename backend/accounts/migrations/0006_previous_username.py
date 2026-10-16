from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_presence'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='previous_username',
            field=models.CharField(blank=True, db_index=True, max_length=40, null=True),
        ),
    ]
