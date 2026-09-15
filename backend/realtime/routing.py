from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    re_path(r'^ws/announcements/$', consumers.AnnouncementConsumer.as_asgi()),
    re_path(r'^ws/lessons/(?P<lesson_id>[^/]+)/translation/$', consumers.TranslationConsumer.as_asgi()),
]
