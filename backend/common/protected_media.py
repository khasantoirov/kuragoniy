"""Uploaded documents behind expiring links.

Lesson files, library books, equipment sheets and lesson posters are not
served from the open /media/ path (nginx answers 404 there): the API hands
a signed address — /api/files/<token>/<file name> — only to someone signed
in, and the link stops working after 6–12 hours. A link copied out of the
platform therefore can't be shared for good.

The token names the file and its expiry, signed with SECRET_KEY. Expiry is
rounded to a 6-hour step so the same file keeps the same address for a
while and the browser can cache it.

Production: the view answers with X-Accel-Redirect and nginx sends the file
from its `internal` /protected-media/ location (Range requests work, the
Python process isn't tied up). Elsewhere (dev, tests) Django streams it.
"""

import mimetypes
import os
import time
from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.http import FileResponse, Http404, HttpResponse
from rest_framework import permissions
from rest_framework.views import APIView

PROTECTED_PREFIXES = ('lesson-files/', 'library-files/', 'equipment-sheets/', 'lesson-posters/')
SALT = 'protected-media'
STEP = 6 * 3600


def is_protected(name: str) -> bool:
    return bool(name) and name.startswith(PROTECTED_PREFIXES)


def protected_url(field_file) -> str | None:
    """The expiring address of an uploaded file (None when empty). Files
    outside PROTECTED_PREFIXES keep their plain /media/ URL."""
    if not field_file:
        return None
    name = field_file.name
    if not is_protected(name):
        return field_file.url
    expires = (int(time.time()) // STEP + 2) * STEP
    token = signing.dumps({'n': name, 'e': expires}, salt=SALT, compress=True)
    return f'/api/files/{token}/{quote(os.path.basename(name))}'


class ProtectedFilesMixin:
    """For a ModelSerializer: list the file fields in `protected_files`;
    they are written as usual and read back as expiring links."""

    protected_files: tuple[str, ...] = ()

    def to_representation(self, instance):
        data = super().to_representation(instance)
        for f in self.protected_files:
            if f in data:
                data[f] = protected_url(getattr(instance, f, None))
        return data


class ProtectedFileView(APIView):
    """GET /api/files/<token>/<name> — the token is the permission (it was
    only ever given to someone signed in), so no login is asked here: an
    <img> or a download link can't send the Authorization header."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, token, filename=''):
        try:
            data = signing.loads(token, salt=SALT)
        except signing.BadSignature:
            raise Http404
        name, expires = str(data.get('n', '')), int(data.get('e', 0))
        if expires < time.time() or not is_protected(name) or '..' in name.split('/') or name.startswith('/'):
            raise Http404
        path = os.path.join(settings.MEDIA_ROOT, name)
        if not os.path.isfile(path):
            raise Http404
        content_type = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        disposition = f"inline; filename*=UTF-8''{quote(os.path.basename(name))}"
        if getattr(settings, 'PROTECTED_MEDIA_ACCEL', False):
            response = HttpResponse(content_type=content_type)
            response['X-Accel-Redirect'] = '/protected-media/' + quote(name)
        else:
            response = FileResponse(open(path, 'rb'), content_type=content_type)
        response['Content-Disposition'] = disposition
        response['Cache-Control'] = 'private, max-age=3600'
        response['X-Robots-Tag'] = 'noindex'
        return response
