"""Saved poster gallery — LessonPosterPage.tsx uploads the generated JPG
here on export so it stays available later, grouped by grade then week.
See lessons/views.py::LessonPosterViewSet.
"""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from lessons.models import LessonPoster

pytestmark = pytest.mark.django_db

FAKE_JPEG = b'\xff\xd8\xff\xe0' + b'0' * 32


def _upload(client, grade=8, hafta=3, topic='Yorug\'lik hodisalari'):
    return client.post(
        '/api/lessons/posters/',
        {
            'grade': grade,
            'hafta': hafta,
            'topic': topic,
            'image': SimpleUploadedFile('poster.jpg', FAKE_JPEG, content_type='image/jpeg'),
        },
        format='multipart',
    )


def test_admin_can_create_a_poster(as_user, admin):
    client = as_user(admin)
    resp = _upload(client)
    assert resp.status_code == 201
    assert LessonPoster.objects.count() == 1
    poster = LessonPoster.objects.get()
    assert poster.grade == 8 and poster.hafta == 3


def test_teacher_cannot_create_a_poster(as_user, teacher):
    client = as_user(teacher)
    resp = _upload(client)
    assert resp.status_code == 403
    assert LessonPoster.objects.count() == 0


def test_non_jpeg_upload_is_rejected(as_user, admin):
    client = as_user(admin)
    resp = client.post(
        '/api/lessons/posters/',
        {
            'grade': 7, 'hafta': 1, 'topic': 'test',
            'image': SimpleUploadedFile('poster.jpg', b'not a jpeg at all', content_type='image/jpeg'),
        },
        format='multipart',
    )
    assert resp.status_code == 400
    assert LessonPoster.objects.count() == 0


def test_list_is_grouped_by_grade_then_week(as_user, admin):
    client = as_user(admin)
    _upload(client, grade=8, hafta=5, topic='B')
    _upload(client, grade=7, hafta=2, topic='A')
    _upload(client, grade=7, hafta=1, topic='C')

    resp = client.get('/api/lessons/posters/')
    assert resp.status_code == 200
    rows = resp.data['results']
    assert [(r['grade'], r['hafta']) for r in rows] == [(7, 1), (7, 2), (8, 5)]


def test_teacher_cannot_list_posters(as_user, teacher):
    client = as_user(teacher)
    resp = client.get('/api/lessons/posters/')
    assert resp.status_code == 403


def test_lessons_root_route_still_works_alongside_posters(as_user, admin):
    """Regression check for the 'posters' vs '' (root) route-ordering
    gotcha in lessons/urls.py — /api/lessons/ itself must not be shadowed."""
    client = as_user(admin)
    resp = client.get('/api/lessons/')
    assert resp.status_code == 200


def test_admin_can_edit_a_posters_metadata(as_user, admin):
    client = as_user(admin)
    poster_id = _upload(client).data['id']

    resp = client.patch(f'/api/lessons/posters/{poster_id}/', {'hafta': 9, 'topic': 'Yangi mavzu'}, format='json')
    assert resp.status_code == 200
    poster = LessonPoster.objects.get(id=poster_id)
    assert poster.hafta == 9 and poster.topic == 'Yangi mavzu'
    assert poster.grade == 8  # untouched field survives a partial update


def test_teacher_cannot_edit_a_poster(as_user, admin, teacher):
    poster_id = _upload(as_user(admin)).data['id']
    resp = as_user(teacher).patch(f'/api/lessons/posters/{poster_id}/', {'hafta': 2}, format='json')
    assert resp.status_code == 403


def test_admin_can_delete_a_poster(as_user, admin):
    client = as_user(admin)
    poster_id = _upload(client).data['id']

    resp = client.delete(f'/api/lessons/posters/{poster_id}/')
    assert resp.status_code == 204
    assert LessonPoster.objects.count() == 0


def test_teacher_cannot_delete_a_poster(as_user, admin, teacher):
    poster_id = _upload(as_user(admin)).data['id']
    resp = as_user(teacher).delete(f'/api/lessons/posters/{poster_id}/')
    assert resp.status_code == 403
    assert LessonPoster.objects.count() == 1
