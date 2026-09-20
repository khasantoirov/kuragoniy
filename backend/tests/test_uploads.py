"""Direct file-upload endpoints for lesson/library attachments — size and
extension are enforced server-side (not just in the UI) since the VPS this
runs on has very little free disk, and deleting/replacing a file must
actually free that space rather than orphaning it (see common/uploads.py).
"""

from django.core.files.uploadedfile import SimpleUploadedFile

import pytest

from library.models import LibraryItem
from lessons.models import Lesson

pytestmark = pytest.mark.django_db

LESSON_PAYLOAD = {"title": "T", "grade": "7", "chorak": 1, "hafta": 1}


def make_lesson():
    return Lesson.objects.create(**LESSON_PAYLOAD)


def pdf(name="worksheet.pdf", size=1024):
    return SimpleUploadedFile(name, b"%PDF-1.4 " + b"0" * size, content_type="application/pdf")


# ── Lessons ─────────────────────────────────────────────────

def test_teacher_cannot_upload_lesson_file(as_user, teacher):
    lesson = make_lesson()
    resp = as_user(teacher).post(f"/api/lessons/{lesson.id}/upload-file/", {"file": pdf()}, format="multipart")
    assert resp.status_code == 403


def test_admin_can_upload_lesson_file(as_user, admin):
    lesson = make_lesson()
    resp = as_user(admin).post(f"/api/lessons/{lesson.id}/upload-file/", {"file": pdf()}, format="multipart")
    assert resp.status_code == 200
    lesson.refresh_from_db()
    assert lesson.file.name


def test_admin_cannot_upload_wrong_extension(as_user, admin):
    lesson = make_lesson()
    bad = SimpleUploadedFile("virus.exe", b"MZ", content_type="application/octet-stream")
    resp = as_user(admin).post(f"/api/lessons/{lesson.id}/upload-file/", {"file": bad}, format="multipart")
    assert resp.status_code == 400
    lesson.refresh_from_db()
    assert not lesson.file


def test_admin_cannot_upload_oversized_lesson_file(as_user, admin):
    lesson = make_lesson()
    huge = pdf(size=21 * 1024 * 1024)  # over the 20MB cap
    resp = as_user(admin).post(f"/api/lessons/{lesson.id}/upload-file/", {"file": huge}, format="multipart")
    assert resp.status_code == 400
    lesson.refresh_from_db()
    assert not lesson.file


def test_reuploading_deletes_the_old_file_from_storage(as_user, admin):
    lesson = make_lesson()
    as_user(admin).post(f"/api/lessons/{lesson.id}/upload-file/", {"file": pdf("first.pdf")}, format="multipart")
    lesson.refresh_from_db()
    old_field = lesson.file
    assert old_field.storage.exists(old_field.name)

    as_user(admin).post(f"/api/lessons/{lesson.id}/upload-file/", {"file": pdf("second.pdf")}, format="multipart")
    assert not old_field.storage.exists(old_field.name)


def test_remove_lesson_file(as_user, admin):
    lesson = make_lesson()
    as_user(admin).post(f"/api/lessons/{lesson.id}/upload-file/", {"file": pdf()}, format="multipart")
    lesson.refresh_from_db()
    field = lesson.file
    assert field.storage.exists(field.name)

    resp = as_user(admin).post(f"/api/lessons/{lesson.id}/remove-file/")
    assert resp.status_code == 200
    lesson.refresh_from_db()
    assert not lesson.file
    assert not field.storage.exists(field.name)


def test_deleting_lesson_removes_its_file_from_storage(as_user, admin):
    lesson = make_lesson()
    as_user(admin).post(f"/api/lessons/{lesson.id}/upload-file/", {"file": pdf()}, format="multipart")
    lesson.refresh_from_db()
    field = lesson.file
    assert field.storage.exists(field.name)

    resp = as_user(admin).delete(f"/api/lessons/{lesson.id}/")
    assert resp.status_code == 204
    assert not field.storage.exists(field.name)


# ── Library ─────────────────────────────────────────────────

def make_library_item(kind="kitob"):
    return LibraryItem.objects.create(title="Kitob", kind=kind)


def test_teacher_cannot_upload_library_file(as_user, teacher):
    item = make_library_item()
    resp = as_user(teacher).post(f"/api/library/{item.id}/upload-file/", {"file": pdf()}, format="multipart")
    assert resp.status_code == 403


def test_admin_can_upload_library_book_file(as_user, admin):
    item = make_library_item()
    resp = as_user(admin).post(f"/api/library/{item.id}/upload-file/", {"file": pdf()}, format="multipart")
    assert resp.status_code == 200
    item.refresh_from_db()
    assert item.file.name


def test_admin_cannot_upload_content_that_does_not_match_its_extension(as_user, admin):
    """The extension check alone only looks at the filename — a file whose
    real content doesn't match the claimed format (e.g. HTML renamed to
    .jpg) must still be rejected by the magic-byte check."""
    item = make_library_item()
    fake_image = SimpleUploadedFile("not-really.jpg", b"<html><body>gotcha</body></html>", content_type="image/jpeg")
    resp = as_user(admin).post(f"/api/library/{item.id}/upload-file/", {"file": fake_image}, format="multipart")
    assert resp.status_code == 400
    item.refresh_from_db()
    assert not item.file


def test_admin_can_upload_library_image(as_user, admin):
    item = make_library_item()
    image = SimpleUploadedFile("diagram.png", b"\x89PNG\r\n\x1a\n" + b"0" * 100, content_type="image/png")
    resp = as_user(admin).post(f"/api/library/{item.id}/upload-file/", {"file": image}, format="multipart")
    assert resp.status_code == 200


def test_admin_can_upload_library_book_over_20mb(as_user, admin):
    """Library's cap is 150MB (raised from the original 20MB shared with
    lessons) since scanned books can legitimately be that large."""
    item = make_library_item()
    big = pdf("scanned-book.pdf", size=25 * 1024 * 1024)
    resp = as_user(admin).post(f"/api/library/{item.id}/upload-file/", {"file": big}, format="multipart")
    assert resp.status_code == 200


def test_admin_cannot_upload_library_book_over_150mb(as_user, admin):
    item = make_library_item()
    huge = pdf("too-big.pdf", size=151 * 1024 * 1024)
    resp = as_user(admin).post(f"/api/library/{item.id}/upload-file/", {"file": huge}, format="multipart")
    assert resp.status_code == 400


def test_admin_cannot_upload_any_file_to_a_video_item(as_user, admin):
    """Video (and havola) stay external-link-only — see the disk-space
    decision this mirrors (common/uploads.py's docstring). Rejected by
    kind, not just extension: even a valid PDF must not attach here."""
    item = make_library_item(kind="video")
    resp = as_user(admin).post(f"/api/library/{item.id}/upload-file/", {"file": pdf()}, format="multipart")
    assert resp.status_code == 400
    item.refresh_from_db()
    assert not item.file


def test_deleting_library_item_removes_its_file_from_storage(as_user, admin):
    item = make_library_item()
    as_user(admin).post(f"/api/library/{item.id}/upload-file/", {"file": pdf()}, format="multipart")
    item.refresh_from_db()
    field = item.file
    assert field.storage.exists(field.name)

    resp = as_user(admin).delete(f"/api/library/{item.id}/")
    assert resp.status_code == 204
    assert not field.storage.exists(field.name)
