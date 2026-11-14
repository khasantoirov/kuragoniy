"""Lines the platform itself adds to the feed (a course finished, a silver
or gold badge) — once per event, and not at all while the feed is off."""

import logging

logger = logging.getLogger(__name__)


def auto_post(user, body: str, key: str) -> None:
    try:
        from common.modules import state

        from .models import Post

        if not state().get('feed', True):
            return
        Post.objects.get_or_create(auto_key=key[:80], defaults={'author': user, 'kind': Post.Kind.AUTO, 'body': body[:3000]})
    except Exception:  # a feed line must never break what triggered it
        logger.exception('feed auto post failed')
