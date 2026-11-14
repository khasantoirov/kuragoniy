"""Ustozlar lentasi: posts, likes and comments between teachers, the
administration's pin/hide, read-only roles, and the platform's own lines."""

import pytest

from accounts.models import User
from achievements import badges
from feed.models import Post
from learning.models import LessonReport
from notifications.models import Notification

pytestmark = pytest.mark.django_db


def test_post_like_comment(as_user, teacher, make_user):
    other = make_user('other@x.uz', approved=True)
    c = as_user(teacher)
    assert c.post('/api/feed/', {'body': ' '}, format='json').status_code == 400
    assert c.post('/api/feed/', {'body': 'x', 'link_url': 'ftp://x'}, format='json').status_code == 400
    resp = c.post('/api/feed/', {'body': "Bugun bosim tajribasi zo'r o'tdi!", 'link_url': 'https://youtu.be/x'}, format='json')
    assert resp.status_code == 201 and resp.data['mine'] is True and resp.data['likes'] == 0
    pid = resp.data['id']
    o = as_user(other)
    assert o.post(f'/api/feed/{pid}/like/').data == {'liked': True, 'likes': 1}
    assert o.post(f'/api/feed/{pid}/comments/', {'body': 'Videoni ham yuboring'}, format='json').status_code == 201
    assert Notification.objects.filter(user=teacher, kind='lenta').exists()
    row = as_user(teacher).get('/api/feed/').data['posts'][0]
    assert row['likes'] == 1 and row['comments'] == 1 and row['liked'] is False
    assert as_user(other).post(f'/api/feed/{pid}/like/').data['liked'] is False  # toggles off
    # only the author edits / deletes
    assert as_user(other).patch(f'/api/feed/{pid}/', {'body': 'y'}, format='json').status_code == 403
    assert as_user(other).delete(f'/api/feed/{pid}/').status_code == 403
    assert as_user(teacher).patch(f'/api/feed/{pid}/', {'body': 'Tahrirlandi'}, format='json').data['edited_at']
    assert as_user(teacher).delete(f'/api/feed/{pid}/').status_code == 204


def test_admin_pins_and_hides(as_user, teacher, admin):
    a = as_user(teacher).post('/api/feed/', {'body': 'Birinchi'}, format='json').data['id']
    b = as_user(teacher).post('/api/feed/', {'body': 'Ikkinchi'}, format='json').data['id']
    assert as_user(teacher).patch(f'/api/feed/{a}/', {'is_pinned': True}, format='json').status_code == 403
    as_user(admin).patch(f'/api/feed/{a}/', {'is_pinned': True}, format='json')
    assert [p['id'] for p in as_user(teacher).get('/api/feed/').data['posts']] == [a, b]
    as_user(admin).patch(f'/api/feed/{b}/', {'hidden': True}, format='json')
    assert [p['id'] for p in as_user(teacher).get('/api/feed/').data['posts']] == [a]
    assert len(as_user(admin).get('/api/feed/').data['posts']) == 2


def test_paging(as_user, teacher):
    for i in range(25):
        Post.objects.create(author=teacher, body=f'P{i}')
    first = as_user(teacher).get('/api/feed/').data
    assert len(first['posts']) == 20 and first['next']
    rest = as_user(teacher).get('/api/feed/', {'before': first['next']}).data
    assert len(rest['posts']) == 5 and rest['next'] is None


def test_roles(jwt_as, observer, make_user):
    boss = make_user('boss@x.uz', role=User.Role.MAKTAB, approved=True)
    pupil = make_user('pupil@x.uz', role=User.Role.STUDENT, approved=True)
    assert jwt_as(observer).get('/api/feed/').status_code == 200
    assert jwt_as(observer).post('/api/feed/', {'body': 'x'}, format='json').status_code == 403
    assert jwt_as(boss).get('/api/feed/').status_code == 403
    assert jwt_as(pupil).get('/api/feed/').status_code == 403


def test_platform_lines_once(teacher):
    from django.utils import timezone

    LessonReport.objects.create(teacher=teacher, date=timezone.localdate(), topic='t', summary='s')
    badges.sync([teacher])  # first count: quiet, no line
    for i in range(9):
        LessonReport.objects.create(teacher=teacher, date=timezone.localdate(), topic=f't{i}', summary='s')
    badges.sync([teacher])
    badges.sync([teacher])
    lines = Post.objects.filter(kind='auto')
    assert lines.count() == 1 and 'kumush' in lines.get().body


PNG = (b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
       b'\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')


def test_post_with_a_picture(as_user, teacher, settings, tmp_path):
    from django.core.files.uploadedfile import SimpleUploadedFile

    c = as_user(teacher)
    pic = SimpleUploadedFile('dars.png', PNG, content_type='image/png')
    resp = c.post('/api/feed/', {'image': pic}, format='multipart')  # a picture needs no words
    assert resp.status_code == 201, resp.data
    url = resp.data['image']
    assert url.startswith('/api/files/')  # an expiring link, never /media/
    post = Post.objects.get(pk=resp.data['id'])
    path = post.image.path
    got = c.get(url)
    assert got.status_code == 200 and b''.join(got.streaming_content) == PNG
    got.close()  # Windows keeps an open file locked
    fake = SimpleUploadedFile('virus.png', b'<html>no</html>', content_type='image/png')
    assert c.post('/api/feed/', {'body': 'x', 'image': fake}, format='multipart').status_code == 400
    doc = SimpleUploadedFile('a.pdf', b'%PDF-1.4', content_type='application/pdf')
    assert c.post('/api/feed/', {'body': 'x', 'image': doc}, format='multipart').status_code == 400
    # the picture goes with the post
    import os
    assert os.path.exists(path)
    c.delete(f'/api/feed/{post.id}/')
    assert not os.path.exists(path)
