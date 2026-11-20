from django.db.models import Q
from rest_framework import viewsets
from rest_framework.permissions import SAFE_METHODS

from common.audit import notify_admin_action
from common.permissions import IsAdminOrDevSuperuser, IsApproved
from common.subjects import window

from .models import Announcement
from .serializers import AnnouncementSerializer


class AnnouncementViewSet(viewsets.ModelViewSet):
    queryset = Announcement.objects.select_related('by').all()
    serializer_class = AnnouncementSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']  # no edit, only post/delete

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsApproved(), IsAdminOrDevSuperuser()]

    def get_queryset(self):
        qs = super().get_queryset()
        fan = window(self.request)
        # everyone's announcements, and the window's own
        return qs.filter(Q(fan='') | Q(fan=fan)) if fan else qs

    def perform_create(self, serializer):
        serializer.save(by=self.request.user)

    def perform_destroy(self, instance):
        text = instance.text
        instance.delete()
        notify_admin_action(self.request.user, f"E'lonni o'chirdi: «{text[:120]}»")
