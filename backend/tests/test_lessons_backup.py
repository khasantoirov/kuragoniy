"""Every 24h the bot sends a lessons+experiments JSON export to every
linked admin/boshliq/dev-superuser — see telegrambot/bot/lessons_backup.py.
Only the pure DB-query half is tested here (_prepare_if_due_sync); the
aiogram loop itself just wraps it with bot.send_document() calls.
"""

import json
from datetime import timedelta

import pytest
from django.utils import timezone

from lessons.models import Experiment, Lesson
from telegrambot.bot.lessons_backup import META_KEY, _prepare_if_due_sync
from telegrambot.models import BotMeta

pytestmark = pytest.mark.django_db


def _link(user, chat_id):
    user.telegram_linked = True
    user.telegram_chat_id = chat_id
    user.save()


def test_first_ever_run_is_due_and_includes_lessons(make_user):
    admin = make_user('backup-admin@example.com', role='admin')
    _link(admin, 111)
    lesson = Lesson.objects.create(title='Zaxira darsi', grade='7', chorak=1, hafta=1)
    Experiment.objects.create(lesson=lesson, name='Tajriba')

    payload, filename, recipients = _prepare_if_due_sync()

    assert payload is not None
    assert list(recipients) == [111]
    assert filename.startswith('darslar_') and filename.endswith('.json')
    data = json.loads(payload)
    assert any(row['title'] == 'Zaxira darsi' and row['experiments'][0]['name'] == 'Tajriba' for row in data)


def test_not_due_again_within_24_hours(make_user):
    admin = make_user('backup-admin2@example.com', role='admin')
    _link(admin, 222)
    BotMeta.objects.create(key=META_KEY, value={'at': timezone.now().isoformat()})

    payload, filename, recipients = _prepare_if_due_sync()
    assert payload is None
    assert recipients is None


def test_due_again_after_24_hours(make_user):
    admin = make_user('backup-admin3@example.com', role='admin')
    _link(admin, 333)
    BotMeta.objects.create(key=META_KEY, value={'at': (timezone.now() - timedelta(hours=25)).isoformat()})

    payload, _, recipients = _prepare_if_due_sync()
    assert payload is not None
    assert list(recipients) == [333]


def test_no_recipients_means_not_due_and_not_marked_sent(make_user):
    # An admin exists but never linked Telegram — nothing to send to, and
    # the check shouldn't be marked "sent" so it retries once someone links.
    make_user('backup-admin4@example.com', role='admin')

    payload, _, recipients = _prepare_if_due_sync()
    assert payload is None
    assert recipients is None
    meta = BotMeta.objects.get(key=META_KEY)
    assert 'at' not in meta.value


def test_plain_teacher_is_not_a_recipient(make_user):
    teacher = make_user('backup-teacher@example.com')
    _link(teacher, 444)
    admin = make_user('backup-admin5@example.com', role='admin')
    _link(admin, 555)

    _, _, recipients = _prepare_if_due_sync()
    assert list(recipients) == [555]


def test_boshliq_is_not_a_recipient(make_user):
    boshliq = make_user('backup-boshliq@example.com', role='boshliq')
    _link(boshliq, 666)
    admin = make_user('backup-admin6@example.com', role='admin')
    _link(admin, 777)

    _, _, recipients = _prepare_if_due_sync()
    assert list(recipients) == [777]
