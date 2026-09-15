from rest_framework import serializers

from .models import LibraryItem


class LibraryItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LibraryItem
        fields = ['id', 'title', 'url', 'file', 'kind', 'grade', 'note', 'updated_at']
        # `file` is written only via LibraryItemViewSet.upload_file (a
        # dedicated multipart action).
        read_only_fields = ['updated_at', 'file']
