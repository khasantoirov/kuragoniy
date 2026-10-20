import os

from rest_framework import serializers

from .models import LibraryItem


class LibraryItemSerializer(serializers.ModelSerializer):
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = LibraryItem
        fields = ['id', 'title', 'url', 'file', 'file_name', 'file_size', 'cover', 'kind', 'grade', 'note', 'updated_at']
        # `file` and `cover` are written only via LibraryItemViewSet's
        # upload-file / upload-cover (dedicated multipart actions).
        read_only_fields = ['updated_at', 'file', 'file_name', 'file_size', 'cover']

    def get_file_name(self, obj):
        return os.path.basename(obj.file.name) if obj.file else None

    def get_file_size(self, obj):
        if not obj.file:
            return None
        try:
            return obj.file.size
        except (OSError, ValueError):
            return None
