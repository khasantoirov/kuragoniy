from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PlatformSettings
from .modules import MODULES, state, usage
from .security import log_event


class ModulesView(APIView):
    """GET: which optional sections are on — for everyone signed in, pupils
    included (their portal hides homework and games too); administrators
    also get each section's usage. PATCH {modules: {key: bool}}:
    administrators switch sections on or off. Both carry `grade_palette`, how
    marks are coloured for everyone; PATCH {grade_palette: name} is the
    developer's."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {'modules': state(), 'grade_palette': PlatformSettings.get().grade_palette}
        if request.user.is_admin:
            data['usage'] = usage()
        return Response(data)

    def patch(self, request):
        if 'grade_palette' in request.data:
            return self._palette(request)
        if not request.user.is_admin:
            return Response({'detail': "Bu amal faqat administrator uchun."}, status=status.HTTP_403_FORBIDDEN)
        incoming = request.data.get('modules')
        if not isinstance(incoming, dict) or any(k not in MODULES or not isinstance(v, bool) for k, v in incoming.items()):
            return Response({'detail': "Noma'lum modul yoki qiymat."}, status=status.HTTP_400_BAD_REQUEST)
        settings = PlatformSettings.get()
        before = state()
        settings.modules = {**(settings.modules or {}), **incoming}
        settings.save(update_fields=['modules', 'updated_at'])
        word = {True: 'yoqildi', False: "o'chirildi"}
        changed = [f'{k}: {word[v]}' for k, v in incoming.items() if before[k] != v]
        if changed:
            log_event('modules_changed', actor=request.user, request=request, detail=', '.join(changed))
        return Response({'modules': state(), 'usage': usage(), 'grade_palette': PlatformSettings.get().grade_palette})

    def _palette(self, request):
        if not request.user.is_dev_superuser:
            return Response({'detail': "Baho ranglarini faqat dasturchi tanlaydi."}, status=status.HTTP_403_FORBIDDEN)
        name = request.data.get('grade_palette')
        if name not in PlatformSettings.GRADE_PALETTES:
            return Response({'detail': "Noma'lum rang varianti."}, status=status.HTTP_400_BAD_REQUEST)
        settings = PlatformSettings.get()
        if settings.grade_palette != name:
            log_event('grade_palette_changed', actor=request.user, request=request, detail=f'{settings.grade_palette} → {name}')
            settings.grade_palette = name
            settings.save(update_fields=['grade_palette', 'updated_at'])
        data = {'modules': state(), 'grade_palette': name}
        if request.user.is_admin:
            data['usage'] = usage()
        return Response(data)
