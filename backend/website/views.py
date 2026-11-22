"""kuragoniy.uz's landing page: one public read (everything the page shows),
the "leave your number" form, and the administration's editing."""

from django.conf import settings
from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from common.audit import notify_admin_action
from common.formguard import FAILED as GUARD_FAILED
from common.formguard import guard_ok
from common.permissions import IsAdminOrDevSuperuser
from common.throttling import LeadRateThrottle
from common.uploads import delete_file_field, validate_upload

from .models import Lead, LandingPhoto, Mentor, SiteSettings, Testimonial

CACHE_KEY = 'website:landing'
IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp']
IMAGE_MB = 3
SETTINGS_FIELDS = ['phone', 'email', 'address', 'telegram', 'instagram', 'youtube', 'facebook', 'video_url',
                   'stat_schools', 'stat_teachers', 'stat_pupils', 'stat_lessons']


def _url(request, f):
    return request.build_absolute_uri(f.url) if f else None


def _live() -> dict:
    from accounts.models import User
    from journal.models import Student
    from lessons.models import Lesson
    from schools.models import School

    return {
        'schools': School.objects.filter(is_active=True).count(),
        'teachers': User.objects.filter(is_active=True, approved=True, role=User.Role.TEACHER).count(),
        'pupils': Student.objects.filter(active=True).count(),
        'lessons': Lesson.objects.count(),
    }


def _figures() -> dict:
    """The live counts, an override taking the place of one when set."""
    s = SiteSettings.get()
    return {k: (v if getattr(s, f'stat_{k}') is None else getattr(s, f'stat_{k}')) for k, v in _live().items()}


class LandingView(APIView):
    """GET — everything the landing page shows; cached for a minute."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        data = cache.get(CACHE_KEY)
        if data is None:
            from schools.models import School

            s = SiteSettings.get()
            data = {
                'contacts': {k: getattr(s, k) for k in SETTINGS_FIELDS if not k.startswith('stat_')},
                'stats': _figures(),
                'photos': [{'id': p.id, 'image': _url(request, p.image), 'caption': p.caption}
                           for p in LandingPhoto.objects.all()],
                'testimonials': [{'id': x.id, 'name': x.name, 'subtitle': x.subtitle, 'text': x.text,
                                  'photo': _url(request, x.photo), 'video_url': x.video_url}
                                 for x in Testimonial.objects.filter(published=True)],
                'mentors': [{'id': m.id, 'name': m.name, 'title': m.title, 'bio': m.bio, 'photo': _url(request, m.photo)}
                            for m in Mentor.objects.filter(published=True)],
                'partners': list(School.objects.filter(is_active=True).order_by('name').values_list('name', flat=True)),
            }
            cache.set(CACHE_KEY, data, 60)
        return Response({**data, 'bot_username': settings.TELEGRAM_BOT_USERNAME})


class LeadCreateView(APIView):
    """POST {name, phone, telegram, message, guard} — "Ma'lumot qoldiring"."""

    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = [LeadRateThrottle]

    def post(self, request):
        from accounts.profile import clean_phone

        if not guard_ok(request, 'lead'):
            return Response({'detail': GUARD_FAILED}, status=status.HTTP_400_BAD_REQUEST)
        name = ' '.join(str(request.data.get('name') or '').split())[:120]
        if len(name) < 2:
            raise ValidationError({'name': "Ismingizni yozing."})
        try:
            phone = clean_phone(request.data.get('phone'))
        except ValidationError as exc:
            raise ValidationError({'phone': exc.detail})
        tg = str(request.data.get('telegram') or '').strip().lstrip('@')[:63]
        lead = Lead.objects.create(name=name, phone=phone, telegram=f'@{tg}' if tg else '',
                                   message=str(request.data.get('message') or '').strip()[:500])
        notify_admin_action(None, f"Saytdan so'rov: {lead.name}, {lead.phone}{' ' + lead.telegram if lead.telegram else ''}"
                                  + (f"\n«{lead.message}»" if lead.message else ''))
        return Response({'ok': True}, status=status.HTTP_201_CREATED)


# ── the administration ────────────────────────────────────────────────

class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SiteSettings
        fields = SETTINGS_FIELDS + ['updated_at']


class SettingsView(APIView):
    permission_classes = [IsAdminOrDevSuperuser]

    def get(self, request):
        return Response({**SettingsSerializer(SiteSettings.get()).data, 'live': _live()})

    def patch(self, request):
        ser = SettingsSerializer(SiteSettings.get(), data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        cache.delete(CACHE_KEY)
        notify_admin_action(request.user, "Sayt sozlamalarini o'zgartirdi (kontaktlar / raqamlar)")
        return Response({**ser.data, 'live': _live()})


class _ImageViewSet(viewsets.ModelViewSet):
    """A list with a picture per row; a new picture replaces (and deletes)
    the old file."""

    permission_classes = [IsAdminOrDevSuperuser]
    image_field = 'photo'
    label = ''

    def _check(self, request):
        f = request.FILES.get(self.image_field)
        if f:
            validate_upload(f, IMAGE_TYPES, IMAGE_MB)
        return f

    def perform_create(self, serializer):
        self._check(self.request)
        serializer.save()
        cache.delete(CACHE_KEY)
        notify_admin_action(self.request.user, f"Saytga qo'shdi ({self.label}): {serializer.instance}")

    def perform_update(self, serializer):
        new_file = self._check(self.request)
        clearing = str(self.request.data.get(f'{self.image_field}_clear') or '') == '1'
        if new_file or clearing:
            delete_file_field(serializer.instance, self.image_field)
        obj = serializer.save()
        if clearing and not new_file:
            setattr(obj, self.image_field, None)
            obj.save(update_fields=[self.image_field])
        cache.delete(CACHE_KEY)

    def perform_destroy(self, instance):
        delete_file_field(instance, self.image_field)
        instance.delete()
        cache.delete(CACHE_KEY)
        notify_admin_action(self.request.user, f"Saytdan olib tashladi ({self.label})")


class PhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = LandingPhoto
        fields = ['id', 'image', 'caption', 'order']


class PhotoViewSet(_ImageViewSet):
    queryset = LandingPhoto.objects.all()
    serializer_class = PhotoSerializer
    image_field = 'image'
    label = 'rasm'


class TestimonialSerializer(serializers.ModelSerializer):
    # a multipart form leaves an unticked box out: shown unless said otherwise
    published = serializers.BooleanField(default=True)

    class Meta:
        model = Testimonial
        fields = ['id', 'name', 'subtitle', 'text', 'photo', 'video_url', 'order', 'published']


class TestimonialViewSet(_ImageViewSet):
    queryset = Testimonial.objects.all()
    serializer_class = TestimonialSerializer
    label = 'fikr'


class MentorSerializer(serializers.ModelSerializer):
    # a multipart form leaves an unticked box out: shown unless said otherwise
    published = serializers.BooleanField(default=True)

    class Meta:
        model = Mentor
        fields = ['id', 'name', 'title', 'bio', 'photo', 'order', 'published']


class MentorViewSet(_ImageViewSet):
    queryset = Mentor.objects.all()
    serializer_class = MentorSerializer
    label = 'ustoz'


class LeadSerializer(serializers.ModelSerializer):
    handled_by_name = serializers.CharField(source='handled_by.name', read_only=True, default='')

    class Meta:
        model = Lead
        fields = ['id', 'name', 'phone', 'telegram', 'message', 'created_at', 'handled_at', 'handled_by_name', 'note']
        read_only_fields = ['name', 'phone', 'telegram', 'message', 'created_at', 'handled_at', 'handled_by_name']


class LeadViewSet(viewsets.ModelViewSet):
    """The requests: read, mark called back (with a note), delete."""

    permission_classes = [IsAdminOrDevSuperuser]
    serializer_class = LeadSerializer
    http_method_names = ['get', 'post', 'patch', 'delete']

    def get_queryset(self):
        qs = Lead.objects.select_related('handled_by')
        state = self.request.query_params.get('state')
        if state == 'open':
            qs = qs.filter(handled_at__isnull=True)
        elif state == 'done':
            qs = qs.filter(~Q(handled_at=None))
        return qs

    @action(detail=True, methods=['post'])
    def handled(self, request, pk=None):
        lead = self.get_object()
        done = str(request.data.get('done', '1')) != '0'
        lead.handled_at = timezone.now() if done else None
        lead.handled_by = request.user if done else None
        if 'note' in request.data:
            lead.note = str(request.data.get('note') or '')[:500]
        lead.save(update_fields=['handled_at', 'handled_by', 'note'])
        return Response(LeadSerializer(lead).data)
