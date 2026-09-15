"""
ASGI config for config project.

Routes plain HTTP to Django as usual, and WebSocket connections to the
Channels consumers defined in realtime/routing.py (announcements push,
lesson-translation-done push). See realtime/auth_middleware.py for how
the WebSocket handshake is authenticated with the same JWT used by the
REST API.
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.prod')

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from realtime.auth_middleware import JWTAuthMiddlewareStack  # noqa: E402
from realtime.routing import websocket_urlpatterns  # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': JWTAuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
})
