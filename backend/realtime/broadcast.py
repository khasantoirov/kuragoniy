"""
Sync-code helpers for pushing a Channels group message from ordinary
Django signal handlers (announcements/signals.py, lessons/signals.py).
"""

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def broadcast_announcement(payload: dict):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)('announcements', {
        'type': 'announcement.created',
        'payload': payload,
    })


def broadcast_translation_done(lesson_id, payload: dict):
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(f'lesson_translation_{lesson_id}', {
        'type': 'translation.done',
        'payload': payload,
    })


def notify_translation_job(job_id, lesson_id):
    """Pushes a pending-job notice to the 'translation_jobs' group, which
    the Python Telegram bot process (Milestone 6) joins directly via
    channel_layer.group_add — not a Django Channels consumer, since the
    bot has no incoming WebSocket connection of its own."""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)('translation_jobs', {
        'type': 'translation.job',
        'payload': {'job_id': job_id, 'lesson_id': lesson_id},
    })
