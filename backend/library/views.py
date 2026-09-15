from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework import viewsets

from common.audit import diff_fields, notify_admin_action, snapshot
from common.permissions import IsAdminOrDevSuperuser, IsApproved
from common.uploads import delete_file_field, validate_upload

from .models import LibraryItem
from .serializers import LibraryItemSerializer

LIBRARY_FILE_EXTENSIONS = ('.pdf', '.doc', '.docx', '.epub', '.jpg', '.jpeg', '.png', '.webp')
LIBRARY_FILE_MAX_MB = 150

LIBRARY_AUDIT_FIELDS = ['title', 'url', 'kind', 'grade', 'note']
LIBRARY_AUDIT_LABELS = {
    'title': 'Nomi', 'url': 'Havola', 'kind': 'Turi', 'grade': 'Sinf', 'note': 'Izoh',
}


class LibraryItemViewSet(viewsets.ModelViewSet):
    queryset = LibraryItem.objects.all()
    serializer_class = LibraryItemSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsApproved(), IsAdminOrDevSuperuser()]

    def perform_create(self, serializer):
        item = serializer.save()
        lines = [f"Kutubxonaga qo'shdi: «{item.title}»"]
        for f in ('kind', 'grade', 'url', 'note'):
            v = getattr(item, f)
            if v:
                lines.append(f"• {LIBRARY_AUDIT_LABELS[f]}: {v}")
        notify_admin_action(self.request.user, '\n'.join(lines))

    def perform_update(self, serializer):
        item_before = serializer.instance
        before = snapshot(item_before, LIBRARY_AUDIT_FIELDS)
        item = serializer.save()
        diff = diff_fields(before, item, LIBRARY_AUDIT_FIELDS, LIBRARY_AUDIT_LABELS)
        if diff:
            notify_admin_action(self.request.user, f"Kutubxona elementini tahrirladi: «{item.title}»\n{diff}")

    def perform_destroy(self, instance):
        lines = [f"Kutubxonadan o'chirdi: «{instance.title}»"]
        for f in ('kind', 'grade', 'url', 'note'):
            v = getattr(instance, f)
            if v:
                lines.append(f"• {LIBRARY_AUDIT_LABELS[f]}: {v}")
        delete_file_field(instance, 'file')
        instance.delete()
        notify_admin_action(self.request.user, '\n'.join(lines))

    @action(detail=True, methods=['post'], url_path='upload-file', parser_classes=[MultiPartParser, FormParser])
    def upload_file(self, request, pk=None):
        item = self.get_object()
        # video/havola stay external-link-only (see common/uploads.py) —
        # only book-like items can carry an uploaded file.
        if item.kind not in (LibraryItem.Kind.KITOB, LibraryItem.Kind.QOLLANMA):
            return Response({'detail': "Fayl yuklash faqat kitob/qo'llanma turlari uchun"}, status=400)
        f = request.FILES.get('file')
        if not f:
            return Response({'detail': 'file required'}, status=400)
        validate_upload(f, LIBRARY_FILE_EXTENSIONS, LIBRARY_FILE_MAX_MB)
        delete_file_field(item, 'file')
        item.file = f
        item.save(update_fields=['file'])
        notify_admin_action(request.user, f"Kutubxona fayliga biriktirdi: «{item.title}»")
        return Response(LibraryItemSerializer(item, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='remove-file')
    def remove_file(self, request, pk=None):
        item = self.get_object()
        delete_file_field(item, 'file')
        item.file = None
        item.save(update_fields=['file'])
        notify_admin_action(request.user, f"Kutubxona faylini o'chirdi: «{item.title}»")
        return Response(LibraryItemSerializer(item, context={'request': request}).data)
