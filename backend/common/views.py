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
    administrators switch sections on or off."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        data = {'modules': state()}
        if request.user.is_admin:
            data['usage'] = usage()
        return Response(data)

    def patch(self, request):
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
        return Response({'modules': state(), 'usage': usage()})
