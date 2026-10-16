from django.conf import settings
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.permissions import BasePermission
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .birthdays import ensure_birthday_notices
from .models import Kind, Notification, NotificationPreference
from .prefs import CHANNELS, DESCRIPTIONS, kinds_for, merged


class IsStaffMember(BasePermission):
    """Approved staff — including the read-only Kuzatuvchi: reading,
    archiving and tuning one's own notifications isn't a change to anyone
    else's data (common/authentication.py lists /api/notifications/ as
    self-service for the same reason)."""

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff_member)


# Appearance keys the client may sync, with the values each accepts — the
# server stores nothing else (store/uiStore.ts owns the meaning).
UI_KEYS = {
    'themeMode': {'system', 'light', 'dark'},
    'lang': {'uz', 'ru', 'en'},
    'navStyle': None,  # validated loosely: a short identifier
    'navDock': {'float', 'full'},
    'navLabels': {True, False},
    'navItems': None,  # list of up to 4 paths
}


class NotificationSerializer(serializers.ModelSerializer):
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'kind', 'kind_label', 'title', 'body', 'url', 'data', 'created_at', 'read_at', 'archived_at']


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """GET /api/notifications/?box=inbox|archive&kind=… — the user's own
    inbox only."""

    serializer_class = NotificationSerializer
    permission_classes = [IsStaffMember]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        box = self.request.query_params.get('box', 'inbox')
        qs = qs.filter(archived_at__isnull=box != 'archive')
        kind = self.request.query_params.get('kind')
        if kind in Kind.values:
            qs = qs.filter(kind=kind)
        return qs

    def list(self, request, *args, **kwargs):
        ensure_birthday_notices(request.user)
        return super().list(request, *args, **kwargs)

    def _mine(self, pk):
        item = Notification.objects.filter(user=self.request.user, pk=pk).first()
        if item is None:
            raise ValidationError({'detail': 'Topilmadi.'})
        return item

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        item = self._mine(pk)
        if not item.read_at:
            item.read_at = timezone.now()
            item.save(update_fields=['read_at'])
        return Response(NotificationSerializer(item).data)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        item = self._mine(pk)
        now = timezone.now()
        item.archived_at = now
        item.read_at = item.read_at or now
        item.save(update_fields=['archived_at', 'read_at'])
        return Response(NotificationSerializer(item).data)

    @action(detail=True, methods=['post'])
    def unarchive(self, request, pk=None):
        item = self._mine(pk)
        item.archived_at = None
        item.save(update_fields=['archived_at'])
        return Response(NotificationSerializer(item).data)

    @action(detail=False, methods=['post'], url_path='read-all')
    def read_all(self, request):
        n = Notification.objects.filter(user=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({'updated': n})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Polled by every open tab: the unread count, plus anything newer
        than ?after=<id> so the tab can play a sound / show a popup."""
        ensure_birthday_notices(request.user)
        mine = Notification.objects.filter(user=request.user, archived_at__isnull=True)
        try:
            after = int(request.query_params.get('after') or 0)
        except (TypeError, ValueError):
            after = 0
        fresh = mine.filter(id__gt=after, read_at__isnull=True)[:5] if after else []
        latest = mine.order_by('-id').values_list('id', flat=True).first() or 0
        return Response({
            'unread': mine.filter(read_at__isnull=True).count(),
            'latest_id': latest,
            'fresh': NotificationSerializer(fresh, many=True).data,
        })


def _clean_ui(raw) -> dict:
    if not isinstance(raw, dict):
        raise ValidationError({'ui': "Noto'g'ri qiymat."})
    out = {}
    for key, value in raw.items():
        if key not in UI_KEYS:
            continue
        allowed = UI_KEYS[key]
        if key == 'navItems':
            if not isinstance(value, list) or len(value) > 4 or not all(isinstance(v, str) and v.startswith('/') and len(v) < 60 for v in value):
                raise ValidationError({'ui': "Pastki navbar: eng ko'pi 4 ta bo'lim."})
        elif key == 'navStyle':
            if not isinstance(value, str) or not value.isidentifier() or len(value) > 30:
                raise ValidationError({'ui': "Noto'g'ri uslub."})
        elif value not in allowed:
            raise ValidationError({'ui': f"Noto'g'ri qiymat: {key}."})
        out[key] = value
    return out


class PreferencesView(APIView):
    """GET/PUT /api/notifications/prefs/ — channel matrix + synced UI."""

    permission_classes = [IsStaffMember]

    def _payload(self, user, pref):
        kinds = kinds_for(user)
        channels = merged(pref.channels if pref else None)
        return {
            'kinds': [{'key': str(k), 'label': Kind(k).label, 'desc': DESCRIPTIONS.get(k, '')} for k in kinds],
            'channels': {str(k): channels[str(k)] for k in kinds},
            'email_enabled': bool(getattr(settings, 'EMAIL_ENABLED', False)) and bool(user.email),
            'telegram_linked': bool(user.telegram_linked and user.telegram_chat_id),
            'ui': (pref.ui if pref else {}) or {},
        }

    def get(self, request):
        pref = NotificationPreference.objects.filter(user=request.user).first()
        return Response(self._payload(request.user, pref))

    def put(self, request):
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)
        fields = []
        if 'channels' in request.data:
            raw = request.data.get('channels')
            if not isinstance(raw, dict):
                raise ValidationError({'channels': "Noto'g'ri qiymat."})
            allowed_kinds = {str(k) for k in kinds_for(request.user)}
            stored = dict(pref.channels or {})
            for kind, row in raw.items():
                if kind not in allowed_kinds or not isinstance(row, dict):
                    continue
                stored[kind] = {c: bool(row[c]) for c in CHANNELS if c in row}
            pref.channels = stored
            fields.append('channels')
        if 'ui' in request.data:
            pref.ui = {**(pref.ui or {}), **_clean_ui(request.data.get('ui'))}
            fields.append('ui')
        if fields:
            pref.save(update_fields=[*fields, 'updated_at'])
        return Response(self._payload(request.user, pref))
