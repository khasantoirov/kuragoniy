"""Every lesson create/edit/delete immediately sends a full lessons JSON
backup to every linked admin's Telegram — see lessons/signals.py's
backup_lessons_on_change. Independent of (and much more frequent than) the
24-hour scheduled backup in telegrambot/bot/lessons_backup.py.

Needs a real (non-transactional) DB and django_db(transaction=True): the
signal defers to transaction.on_commit, which Django's default
rollback-wrapped test transaction never actually fires — same reasoning as
test_admin_audit.py's notify_admin_action tests.
"""

import json
import time
from unittest.mock import patch

import pytest

from lessons.models import Lesson

pytestmark = pytest.mark.django_db(transaction=True)


def _wait_for_calls(mock_post, count=1, timeout=2.0):
    deadline = time.time() + timeout
    while time.time() < deadline and mock_post.call_count < count:
        time.sleep(0.02)


def _link(user, chat_id):
    user.telegram_linked = True
    user.telegram_chat_id = chat_id
    user.save()


@patch('common.audit.requests.post')
def test_creating_a_lesson_sends_a_backup(mock_post, make_user, monkeypatch):
    monkeypatch.setenv('BOT_TOKEN', 'test-token')
    admin = make_user('backup-edit-admin1@example.com', role='admin')
    _link(admin, 999)

    Lesson.objects.create(title='Yangi dars', grade='7', chorak=2, hafta=3)

    _wait_for_calls(mock_post)
    assert mock_post.call_count == 1
    kwargs = mock_post.call_args.kwargs
    assert kwargs['data']['chat_id'] == 999
    filename, payload, content_type = kwargs['files']['document']
    assert filename.startswith('darslar_') and filename.endswith('.json')
    assert content_type == 'application/json'
    data = json.loads(payload)
    assert any(row['title'] == 'Yangi dars' for row in data)


@patch('common.audit.requests.post')
def test_editing_a_lesson_with_new_experiments_sends_exactly_one_backup(mock_post, make_user, monkeypatch):
    """_sync_experiments creates each new Experiment row individually, but
    only Lesson itself is hooked — editing a lesson with 2 brand-new
    experiments must still fire the backup once, not 3 times."""
    monkeypatch.setenv('BOT_TOKEN', 'test-token')
    admin = make_user('backup-edit-admin2@example.com', role='admin')
    _link(admin, 888)

    lesson = Lesson.objects.create(title='Dars', grade='7', chorak=1, hafta=1)
    _wait_for_calls(mock_post)
    mock_post.reset_mock()

    from lessons.serializers import LessonSerializer
    serializer = LessonSerializer(lesson, data={
        'title': 'Yangilangan dars', 'grade': '7', 'chorak': 1, 'hafta': 1,
        'experiments': [
            {'name': 'Tajriba 1', 'type': 'oddiy'},
            {'name': 'Tajriba 2', 'type': 'oddiy'},
        ],
    })
    assert serializer.is_valid(), serializer.errors
    serializer.save()

    _wait_for_calls(mock_post)
    time.sleep(0.3)  # let any extra (unwanted) sends have a chance to land too
    assert mock_post.call_count == 1


@patch('common.audit.requests.post')
def test_deleting_a_lesson_sends_a_backup(mock_post, make_user, monkeypatch):
    monkeypatch.setenv('BOT_TOKEN', 'test-token')
    admin = make_user('backup-edit-admin3@example.com', role='admin')
    _link(admin, 777)

    lesson = Lesson.objects.create(title="O'chiriladigan dars", grade='9', chorak=3, hafta=5)
    _wait_for_calls(mock_post)
    mock_post.reset_mock()

    lesson.delete()

    _wait_for_calls(mock_post)
    assert mock_post.call_count == 1
    data = json.loads(mock_post.call_args.kwargs['files']['document'][1])
    assert not any(row['title'] == "O'chiriladigan dars" for row in data)


@patch('common.audit.requests.post')
def test_no_bot_token_means_no_send_attempt(mock_post, make_user, monkeypatch):
    monkeypatch.delenv('BOT_TOKEN', raising=False)
    admin = make_user('backup-edit-admin4@example.com', role='admin')
    _link(admin, 666)

    Lesson.objects.create(title="Token yo'q", grade='7', chorak=1, hafta=1)

    time.sleep(0.3)
    assert mock_post.call_count == 0


@patch('common.audit.requests.post')
def test_boshliq_does_not_receive_the_on_edit_backup(mock_post, make_user, monkeypatch):
    """The on-edit lessons backup is admin/dev-superuser-only — unlike
    notify_admin_action's general audit log, boshliq shouldn't get it."""
    monkeypatch.setenv('BOT_TOKEN', 'test-token')
    boshliq = make_user('backup-edit-boshliq@example.com', role='boshliq')
    _link(boshliq, 555)
    admin = make_user('backup-edit-admin5@example.com', role='admin')
    _link(admin, 555555)

    Lesson.objects.create(title='Boshliqsiz dars', grade='7', chorak=1, hafta=1)

    _wait_for_calls(mock_post)
    time.sleep(0.3)  # let any extra (unwanted) sends to boshliq have a chance to land too
    assert mock_post.call_count == 1
    assert mock_post.call_args.kwargs['data']['chat_id'] == 555555
