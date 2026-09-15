"""
Sync helper for fanning a payload out to every subscribed device via the
Push API — reaches closed tabs/apps, unlike the Channels 'announcements'
group broadcast (realtime/broadcast.py) which only reaches open tabs.
"""

import json
import logging

from django.conf import settings
from pywebpush import WebPushException, webpush

from .models import PushSubscription

logger = logging.getLogger(__name__)


def send_web_push(subscription: PushSubscription, payload: dict) -> bool:
    try:
        webpush(
            subscription_info={
                'endpoint': subscription.endpoint,
                'keys': {'p256dh': subscription.p256dh, 'auth': subscription.auth},
            },
            data=json.dumps(payload),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,
            vapid_claims={'sub': f'mailto:{settings.VAPID_CONTACT_EMAIL}'},
        )
        return True
    except WebPushException as exc:
        status_code = getattr(exc.response, 'status_code', None)
        if status_code in (404, 410):
            # Browser revoked the subscription (uninstalled, cleared data,
            # etc.) — stop retrying it forever.
            subscription.delete()
        else:
            logger.warning('Web push failed (%s): %s', status_code, exc)
        return False


def send_push_to_approved(payload: dict):
    for sub in PushSubscription.objects.select_related('user').all():
        if sub.user.is_approved_effective:
            send_web_push(sub, payload)
