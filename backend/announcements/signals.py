from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Announcement


@receiver(post_save, sender=Announcement)
def push_announcement(sender, instance: Announcement, created, **kwargs):
    """Fans out a new announcement to every connected web client via the
    'announcements' Channels group, replacing the old Firestore
    onSnapshot listener. The Python Telegram bot (Milestone 6) joins the
    same group directly to fan out to Telegram as well."""
    if not created:
        return

    from realtime.broadcast import broadcast_announcement

    broadcast_announcement({
        'id': instance.id,
        'text': instance.text,
        'at': instance.at.isoformat(),
        'by': instance.by.name if instance.by_id else None,
    })

    _send_web_push(instance)


def _send_web_push(instance: Announcement):
    """Fans the announcement out via the Push API too, so it also reaches
    devices with the app closed — not just tabs already connected to the
    Channels group above. Runs off-thread since each subscription is an
    outbound HTTPS call to the browser's push service (FCM/Mozilla/etc.)
    and shouldn't hold up the admin's request."""
    import threading

    from django.db import close_old_connections

    from webpush.send import send_push_to_approved

    def run():
        try:
            send_push_to_approved({
                'title': "E'lon",
                'body': instance.text[:180],
                'url': '/',
                'tag': f'announcement-{instance.id}',
            })
        finally:
            close_old_connections()

    threading.Thread(target=run, daemon=True).start()
