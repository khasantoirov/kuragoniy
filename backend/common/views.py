from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
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
        return Response(self._data(request))

    @staticmethod
    def _data(request, with_usage=None):
        settings = PlatformSettings.get()
        data = {'modules': state(), 'grade_palette': settings.grade_palette, 'protection': settings.protection_state()}
        if (request.user.is_admin if with_usage is None else with_usage):
            data['usage'] = usage()
        return data

    def patch(self, request):
        if 'grade_palette' in request.data:
            return self._palette(request)
        if 'protection' in request.data:
            return self._protection(request)
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
        return Response(self._data(request, with_usage=True))

    def _protection(self, request):
        """Kontent himoyasi — only the developer changes it."""
        if not request.user.is_dev_superuser:
            return Response({'detail': "Kontent himoyasini faqat dasturchi sozlaydi."}, status=status.HTTP_403_FORBIDDEN)
        incoming = request.data.get('protection')
        defaults = PlatformSettings.PROTECTION_DEFAULTS
        if not isinstance(incoming, dict) or any(
                k not in defaults or (k == 'scope' and v not in PlatformSettings.PROTECTION_SCOPES)
                or (k != 'scope' and not isinstance(v, bool)) for k, v in incoming.items()):
            return Response({'detail': "Noma'lum sozlama yoki qiymat."}, status=status.HTTP_400_BAD_REQUEST)
        settings = PlatformSettings.get()
        before = settings.protection_state()
        settings.protection = {**(settings.protection or {}), **incoming}
        settings.save(update_fields=['protection', 'updated_at'])
        changed = [f'{k}: {before[k]} → {v}' for k, v in incoming.items() if before[k] != v]
        if changed:
            log_event('protection_changed', actor=request.user, request=request, detail=', '.join(changed))
        return Response(self._data(request))

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
        return Response(self._data(request))


class ProtectionEventView(APIView):
    """POST {kind: screenshot|print|copy, page}: the content guard saw an
    attempt (PrintScreen, the browser's print, a copy) — it goes to the
    security log under the viewer's name. The page sends one per kind per
    minute at most; the throttle backs that up."""

    permission_classes = [IsAuthenticated]
    throttle_scope = 'protection_event'
    KINDS = {'screenshot': 'Skrinshot urinishi', 'print': 'Chop etish urinishi', 'copy': 'Nusxa olish urinishi'}

    def get_throttles(self):
        return [ScopedRateThrottle()]

    def post(self, request):
        kind = request.data.get('kind')
        if kind not in self.KINDS:
            return Response({'detail': "Noma'lum hodisa."}, status=status.HTTP_400_BAD_REQUEST)
        page = str(request.data.get('page') or '')[:200]
        log_event(f'{kind}_attempt', actor=request.user, request=request, detail=f'{self.KINDS[kind]}: {page}')
        return Response(status=status.HTTP_204_NO_CONTENT)
