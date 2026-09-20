"""LessonViewSet.bulk_import — the admin JSON-upload "Darslarni import
qilish" flow's real backend endpoint (see frontend/src/features/admin/
ImportLessonsModal.tsx), replacing the old client-side loop of N sequential
POST /lessons/ calls. Covers: add/replace modes, duplicate-slot skipping
(pre-existing and intra-file), per-row error isolation (a bad row doesn't
abort the batch), and that a whole import sends exactly one
lessons-backup Telegram document instead of one per row (see
lessons/signals.py's suppress_lessons_backup).

Also covers the related concepts_ru/concepts_en fix in the manual
import_translations action.
"""

import time
from unittest.mock import patch

import pytest

from lessons.models import Experiment, Lesson

pytestmark = pytest.mark.django_db


def _wait_for_calls(mock_post, count=1, timeout=2.0):
    deadline = time.time() + timeout
    while time.time() < deadline and mock_post.call_count < count:
        time.sleep(0.02)


def _link(user, chat_id):
    user.telegram_linked = True
    user.telegram_chat_id = chat_id
    user.save()


def make_lesson(grade, chorak, hafta, title="Dars"):
    return Lesson.objects.create(title=title, grade=grade, chorak=chorak, hafta=hafta)


def valid_row(**overrides):
    row = {
        "title": "Yangi dars", "grade": "7", "chorak": 1, "hafta": 1, "goal": "",
        "experiments": [{"name": "Tajriba 1", "desc": "d"}],
    }
    row.update(overrides)
    return row


def bulk_import(client, mode, rows):
    return client.post("/api/lessons/bulk_import/", {"mode": mode, "rows": rows}, format="json")


# ── Permissions & payload validation ───────────────────────────

def test_teacher_cannot_bulk_import(as_user, teacher):
    resp = bulk_import(as_user(teacher), "add", [valid_row()])
    assert resp.status_code == 403


def test_bad_mode_returns_400(as_user, admin):
    resp = bulk_import(as_user(admin), "wat", [valid_row()])
    assert resp.status_code == 400


def test_empty_rows_returns_400(as_user, admin):
    resp = bulk_import(as_user(admin), "add", [])
    assert resp.status_code == 400


# ── add mode ────────────────────────────────────────────────

def test_add_mode_creates_all_valid_rows(as_user, admin):
    rows = [valid_row(title=f"Dars {i}", grade="5-6", hafta=i) for i in range(1, 4)]
    resp = bulk_import(as_user(admin), "add", rows)
    assert resp.status_code == 200
    assert resp.data["created"] == 3
    assert resp.data["errors"] == []
    assert resp.data["skipped"] == []
    assert Lesson.objects.filter(grade="5-6").count() == 3
    lesson = Lesson.objects.get(title="Dars 1")
    assert lesson.experiments.count() == 1
    assert lesson.experiments.first().name == "Tajriba 1"


def test_duplicate_skipped_against_existing_db_row(as_user, admin):
    make_lesson("5-6", 1, 1, title="Mavjud")
    resp = bulk_import(as_user(admin), "add", [valid_row(title="Yangi urinish", grade="5-6", hafta=1)])
    assert resp.status_code == 200
    assert resp.data["created"] == 0
    assert len(resp.data["skipped"]) == 1
    assert resp.data["skipped"][0]["reason"] == "duplicate"
    assert Lesson.objects.filter(grade="5-6").count() == 1


def test_duplicate_skipped_within_same_file(as_user, admin):
    rows = [
        valid_row(title="Birinchi", grade="5-6", hafta=1),
        valid_row(title="Ikkinchi (dublikat)", grade="5-6", hafta=1),
    ]
    resp = bulk_import(as_user(admin), "add", rows)
    assert resp.status_code == 200
    assert resp.data["created"] == 1
    assert len(resp.data["skipped"]) == 1
    assert Lesson.objects.get(grade="5-6").title == "Birinchi"


def test_invalid_row_recorded_as_error_others_still_created(as_user, admin):
    rows = [
        valid_row(title="Yaxshi 1", grade="5-6", hafta=1),
        {"title": "", "grade": "5-6", "chorak": 1, "hafta": 2},  # blank title -> invalid
        valid_row(title="Yaxshi 2", grade="5-6", hafta=3),
    ]
    resp = bulk_import(as_user(admin), "add", rows)
    assert resp.status_code == 200
    assert resp.data["created"] == 2
    assert len(resp.data["errors"]) == 1
    assert resp.data["errors"][0]["row"] == 1
    assert Lesson.objects.filter(grade="5-6").count() == 2


# ── replace mode ────────────────────────────────────────────

def test_replace_mode_deletes_existing_then_creates(as_user, admin):
    old1 = make_lesson("5-6", 1, 1, title="Eski 1")
    old2 = make_lesson("5-6", 1, 2, title="Eski 2")
    other_grade = make_lesson("7", 1, 1, title="Boshqa sinf darsi")

    resp = bulk_import(as_user(admin), "replace", [valid_row(title="Yangi", grade="5-6", hafta=1)])
    assert resp.status_code == 200
    assert resp.data["deleted"] == 2
    assert resp.data["created"] == 1
    assert resp.data["grades_replaced"] == ["5-6"]
    assert not Lesson.objects.filter(id__in=[old1.id, old2.id]).exists()
    assert Lesson.objects.filter(grade="5-6").count() == 1

    other_grade.refresh_from_db()  # untouched — didn't raise DoesNotExist


def test_replace_mode_removes_file_from_storage(as_user, admin):
    from django.core.files.uploadedfile import SimpleUploadedFile

    lesson = make_lesson("5-6", 1, 1, title="Fayli bor dars")
    lesson.file = SimpleUploadedFile("x.pdf", b"%PDF-1.4 " + b"0" * 100, content_type="application/pdf")
    lesson.save()
    field = lesson.file
    assert field.storage.exists(field.name)

    resp = bulk_import(as_user(admin), "replace", [valid_row(title="Yangi", grade="5-6", hafta=1)])
    assert resp.status_code == 200
    assert not field.storage.exists(field.name)


# ── backup-signal suppression (exactly one send per import) ────

@pytest.mark.django_db(transaction=True)
@patch("common.audit.requests.post")
def test_bulk_import_sends_exactly_one_backup_for_n_rows(mock_post, as_user, admin, monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "test-token")
    _link(admin, 111)
    rows = [valid_row(title=f"Dars {i}", grade="5-6", hafta=i) for i in range(1, 6)]

    resp = bulk_import(as_user(admin), "add", rows)
    assert resp.status_code == 200
    assert resp.data["created"] == 5

    _wait_for_calls(mock_post)
    time.sleep(0.3)  # let any extra (unwanted) sends have a chance to land too
    assert mock_post.call_count == 1


@pytest.mark.django_db(transaction=True)
@patch("common.audit.requests.post")
def test_bulk_import_replace_mode_sends_exactly_one_backup(mock_post, as_user, admin, monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "test-token")
    _link(admin, 222)
    make_lesson("5-6", 1, 1, title="Eski")
    _wait_for_calls(mock_post)  # the pre-seed create's own backup
    mock_post.reset_mock()

    resp = bulk_import(as_user(admin), "replace", [valid_row(title="Yangi", grade="5-6", hafta=1)])
    assert resp.status_code == 200

    _wait_for_calls(mock_post)
    time.sleep(0.3)
    assert mock_post.call_count == 1


@pytest.mark.django_db(transaction=True)
@patch("common.audit.requests.post")
def test_bulk_import_sends_no_backup_when_nothing_changed(mock_post, as_user, admin, monkeypatch):
    monkeypatch.setenv("BOT_TOKEN", "test-token")
    _link(admin, 333)

    resp = bulk_import(as_user(admin), "add", [{"title": "", "grade": "5-6", "chorak": 1, "hafta": 1}])
    assert resp.status_code == 200
    assert resp.data["created"] == 0

    time.sleep(0.3)
    assert mock_post.call_count == 0


# ── import_translations: concepts_ru/concepts_en gap ───────────

def test_import_translations_writes_concepts_ru_en(as_user, admin):
    lesson = make_lesson("5-6", 1, 1, title="Dars")
    exp = Experiment.objects.create(lesson=lesson, order=0, name="Tajriba", concepts=["A", "B"])

    payload = [{
        "id": lesson.id,
        "experiments": [{"id": exp.id, "concepts_ru": ["А", "Б"], "concepts_en": ["A", "B"]}],
    }]
    resp = as_user(admin).post("/api/lessons/import_translations/", payload, format="json")
    assert resp.status_code == 200
    assert resp.data["ok"] == 1

    exp.refresh_from_db()
    assert exp.concepts_ru == ["А", "Б"]
    assert exp.concepts_en == ["A", "B"]
