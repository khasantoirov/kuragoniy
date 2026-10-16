"""Announcements land in every staff member's inbox (Telegram keeps its
own fan-out in the bot, which reads the same settings)."""

from django.contrib.auth import get_user_model
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from announcements.models import Announcement

from .models import Kind, Notification
from .service import notify


def _announcement_key(announcement_id) -> str:
    return f'ann:{announcement_id}'


@receiver(post_save, sender=Announcement)
def announcement_to_inbox(sender, instance: Announcement, created, **kwargs):
    if not created:
        return
    User = get_user_model()
    staff = list(
        User.objects.filter(is_active=True, approved=True).exclude(role=User.Role.STUDENT).exclude(pk=instance.by_id)
    )
    text = instance.text.strip()
    first_line = text.splitlines()[0] if text else ''
    notify(
        staff, Kind.ELON, "E'lon", text, '/notifications',
        channels=('app', 'email'), data={'announcement': instance.id, 'preview': first_line[:120]},
        dedupe_key=_announcement_key(instance.id),
    )


@receiver(post_delete, sender=Announcement)
def announcement_removed(sender, instance: Announcement, **kwargs):
    Notification.objects.filter(kind=Kind.ELON, dedupe_key=_announcement_key(instance.id)).delete()
