"""Existing announcements become (already read) inbox messages for every
staff member, so the new inbox starts with the same history the old
Bildirishnomalar page showed."""

from django.db import migrations
from django.utils import timezone


def backfill(apps, schema_editor):
    Announcement = apps.get_model('announcements', 'Announcement')
    Notification = apps.get_model('notifications', 'Notification')
    User = apps.get_model('accounts', 'User')
    staff = list(User.objects.filter(is_active=True, approved=True).exclude(role='student').values_list('id', flat=True))
    now = timezone.now()
    for ann in Announcement.objects.order_by('-at')[:30]:
        key = f'ann:{ann.id}'
        text = (ann.text or '').strip()
        first = text.splitlines()[0][:120] if text else ''
        Notification.objects.bulk_create(
            [Notification(user_id=uid, kind='elon', title="E'lon", body=text, url='/notifications',
                          data={'announcement': ann.id, 'preview': first}, dedupe_key=key, read_at=now)
             for uid in staff if uid != ann.by_id],
            ignore_conflicts=True,
        )
        Notification.objects.filter(dedupe_key=key).update(created_at=ann.at)


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0001_initial'),
        ('announcements', '0001_initial'),
        ('accounts', '0007_usersession'),
    ]

    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
