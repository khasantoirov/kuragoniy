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
COVER_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.webp')
COVER_MAX_MB = 5

LIBRARY_AUDIT_FIELDS = ['title', 'url', 'kind', 'grade', 'subject', 'note']
LIBRARY_AUDIT_LABELS = {
    'title': 'Nomi', 'url': 'Havola', 'kind': 'Turi', 'grade': 'Sinf', 'subject': 'Fan', 'note': 'Izoh',
    'lang': 'Til', 'section': "Qo'llanma bo'limi",
}


def visible_items(qs, user, fan=None):
    """Books of both fanlar (blank subject) plus the person's own fan(s) —
    only `fan`'s when a window is given (common/subjects.window)."""
    from django.db.models import Q

    from common.subjects import CODES, subjects_for

    mine = subjects_for(user)
    if fan in mine:
        mine = [fan]
    if set(mine) >= set(CODES):
        return qs
    return qs.filter(Q(subject='') | Q(subject__in=mine))


class LibraryItemViewSet(viewsets.ModelViewSet):
    queryset = LibraryItem.objects.all()
    serializer_class = LibraryItemSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        subject = self.request.query_params.get('subject')
        if subject:
            qs = qs.filter(subject__in=['', subject])
        from common.subjects import window

        return visible_items(qs, self.request.user, window(self.request))

    def get_permissions(self):
        # reading, and counting an open, is anyone's who may see the item
        # (this override replaces a per-action permission_classes)
        if self.request.method in SAFE_METHODS or self.action == 'opened':
            return [IsApproved()]
        return [IsApproved(), IsAdminOrDevSuperuser()]

    def perform_create(self, serializer):
        from common.subjects import window

        # added in a fan's window, it is that fan's unless said otherwise
        fan = window(self.request)
        extra = {'subject': fan} if fan and not serializer.validated_data.get('subject') else {}
        item = serializer.save(**extra)
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
        delete_file_field(instance, 'cover')
        instance.delete()
        notify_admin_action(self.request.user, '\n'.join(lines))

    @action(detail=True, methods=['post'], permission_classes=[IsApproved])
    def opened(self, request, pk=None):
        """POST when someone opens, reads or downloads it: counted once per
        person a day, so reopening the same book doesn't inflate it."""
        from django.core.cache import cache
        from django.db.models import F
        from django.utils import timezone

        item = self.get_object()  # only what this person may see
        key = f'library:opened:{item.pk}:{request.user.pk}:{timezone.localdate():%Y%m%d}'
        if cache.add(key, 1, 60 * 60 * 26):
            LibraryItem.objects.filter(pk=item.pk).update(opens=F('opens') + 1)  # updated_at stays
        return Response({'ok': True})

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

    @action(detail=True, methods=['post'], url_path='upload-cover', parser_classes=[MultiPartParser, FormParser])
    def upload_cover(self, request, pk=None):
        item = self.get_object()
        f = request.FILES.get('cover')
        if not f:
            return Response({'detail': 'cover required'}, status=400)
        validate_upload(f, COVER_EXTENSIONS, COVER_MAX_MB)
        delete_file_field(item, 'cover')
        item.cover = f
        item.save(update_fields=['cover'])
        notify_admin_action(request.user, f"Kutubxona materialiga muqova qo'ydi: «{item.title}»")
        return Response(LibraryItemSerializer(item, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='remove-cover')
    def remove_cover(self, request, pk=None):
        item = self.get_object()
        delete_file_field(item, 'cover')
        item.cover = None
        item.save(update_fields=['cover'])
        notify_admin_action(request.user, f"Kutubxona materiali muqovasini o'chirdi: «{item.title}»")
        return Response(LibraryItemSerializer(item, context={'request': request}).data)
