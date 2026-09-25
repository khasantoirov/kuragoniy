import os

from rest_framework import serializers

from .models import LibraryItem


class LibraryItemSerializer(serializers.ModelSerializer):
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = LibraryItem
        fields = ['id', 'title', 'url', 'file', 'file_name', 'file_size', 'kind', 'grade', 'note', 'updated_at']
        # `file` is written only via LibraryItemViewSet.upload_file (a
        # dedicated multipart action).
        read_only_fields = ['updated_at', 'file', 'file_name', 'file_size']

    def get_file_name(self, obj):
        return os.path.basename(obj.file.name) if obj.file else None

    def get_file_size(self, obj):
        if not obj.file:
            return None
        try:
            return obj.file.size
        except (OSError, ValueError):
            return None
