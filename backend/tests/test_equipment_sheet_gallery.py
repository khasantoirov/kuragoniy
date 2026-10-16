"""Saved equipment-sheet gallery — EquipmentSheetPage.tsx uploads the
rendered table JPG here ("Galereyaga saqlash"), mirroring the lesson
poster gallery. See lessons/views.py::EquipmentSheetViewSet."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from lessons.models import EquipmentSheet

pytestmark = pytest.mark.django_db

FAKE_JPEG = b'\xff\xd8\xff\xe0' + b'0' * 32


def _upload(client, grade='8-9', hafta=4, title='Tezlik. Tekis va notekis harakat', data=FAKE_JPEG):
    return client.post(
        '/api/lessons/equipment-sheets/',
        {'grade': grade, 'hafta': hafta, 'title': title,
         'image': SimpleUploadedFile('sheet.jpg', data, content_type='image/jpeg')},
        format='multipart',
    )


def test_admin_saves_sheet_to_gallery(as_user, admin):
    resp = _upload(as_user(admin))
    assert resp.status_code == 201
    sheet = EquipmentSheet.objects.get()
    assert (sheet.grade, sheet.hafta, sheet.title) == ('8-9', 4, 'Tezlik. Tekis va notekis harakat')
    assert resp.data['image']


def test_teacher_cannot_use_gallery(as_user, teacher):
    assert _upload(as_user(teacher)).status_code == 403
    assert as_user(teacher).get('/api/lessons/equipment-sheets/').status_code == 403


def test_non_jpeg_rejected(as_user, admin):
    assert _upload(as_user(admin), data=b'not a jpeg').status_code == 400
    assert not EquipmentSheet.objects.exists()


def test_list_ordered_by_grade_then_week(as_user, admin):
    client = as_user(admin)
    _upload(client, grade='8-9', hafta=2)
    _upload(client, grade='7', hafta=5)
    _upload(client, grade='7', hafta=1)
    rows = client.get('/api/lessons/equipment-sheets/').data['results']
    assert [(r['grade'], r['hafta']) for r in rows] == [('7', 1), ('7', 5), ('8-9', 2)]


def test_edit_changes_metadata_only_and_delete_removes(as_user, admin):
    client = as_user(admin)
    sid = _upload(client).data['id']
    before = EquipmentSheet.objects.get(pk=sid).image.name
    resp = client.patch(f'/api/lessons/equipment-sheets/{sid}/', {'grade': '8-9', 'hafta': 7, 'title': 'Yangi'}, format='json')
    assert resp.status_code == 200
    sheet = EquipmentSheet.objects.get(pk=sid)
    assert (sheet.grade, sheet.hafta, sheet.title) == ('8-9', 7, 'Yangi') and sheet.image.name == before
    assert client.delete(f'/api/lessons/equipment-sheets/{sid}/').status_code == 204
    assert not EquipmentSheet.objects.exists()
