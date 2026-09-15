from rest_framework import serializers

from .models import Announcement


class AnnouncementSerializer(serializers.ModelSerializer):
    by_name = serializers.CharField(source='by.name', read_only=True)

    class Meta:
        model = Announcement
        fields = ['id', 'text', 'at', 'by', 'by_name']
        read_only_fields = ['at', 'by']
