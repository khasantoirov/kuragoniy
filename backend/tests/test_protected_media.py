"""Uploaded documents are handed out only as expiring, signed links."""

import time
from unittest.mock import patch

import pytest
from django.core import signing
from django.core.files.base import ContentFile
from rest_framework.test import APIClient

from common.protected_media import SALT, protected_url
from library.models import LibraryItem

pytestmark = pytest.mark.django_db


@pytest.fixture
def book():
    item = LibraryItem.objects.create(title="Fizika 7", kind=LibraryItem.Kind.KITOB)
    item.file.save("fizika-7.pdf", ContentFile(b"%PDF-1.4 kitob"), save=True)
    return item


def test_api_gives_a_signed_link_not_the_media_path(as_user, teacher, book):
    data = as_user(teacher).get(f"/api/library/{book.pk}/").data
    assert data["file"].startswith("/api/files/") and data["file"].endswith("/fizika-7.pdf")
    assert "/media/" not in data["file"]


def test_link_opens_without_login(book):
    url = protected_url(book.file)
    resp = APIClient().get(url)
    assert resp.status_code == 200
    assert b"".join(resp.streaming_content) == b"%PDF-1.4 kitob"
    assert resp["Content-Type"] == "application/pdf"
    assert resp["Cache-Control"].startswith("private")


def test_link_expires(book):
    url = protected_url(book.file)
    with patch("common.protected_media.time.time", return_value=time.time() + 13 * 3600):
        assert APIClient().get(url).status_code == 404


def test_tampered_or_forged_links_fail(book):
    url = protected_url(book.file)
    token = url.split("/")[3]
    assert APIClient().get(url.replace(token, token[:-2] + "xx")).status_code == 404
    assert APIClient().get("/api/files/garbage/fizika-7.pdf").status_code == 404
    # A real signature over a path outside the protected folders, or climbing out.
    for name in ("avatars/x.png", "library-files/../../.env", "/etc/passwd"):
        forged = signing.dumps({"n": name, "e": int(time.time()) + 3600}, salt=SALT, compress=True)
        assert APIClient().get(f"/api/files/{forged}/x").status_code == 404


def test_accel_redirect_in_production(settings, book):
    settings.PROTECTED_MEDIA_ACCEL = True
    resp = APIClient().get(protected_url(book.file))
    assert resp.status_code == 200
    assert resp["X-Accel-Redirect"] == "/protected-media/" + book.file.name


def test_same_link_within_a_window(book):
    assert protected_url(book.file) == protected_url(book.file)


def test_unprotected_folders_keep_plain_media_urls():
    class F:
        name = "avatars/a.png"
        url = "/media/avatars/a.png"

        def __bool__(self):
            return True

    assert protected_url(F()) == "/media/avatars/a.png"
    assert protected_url(None) is None
