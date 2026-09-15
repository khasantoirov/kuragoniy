"""manage.py backup_db — the daily (systemd timer, 03:00) full-database
backup. Beyond writing the compressed .sqlite3.gz under backups/, it now
also sends that file to every linked admin's Telegram: backups/ lives on
this one VPS's disk, so without an off-site copy a lost/corrupted disk
takes every backup down with the live data.
"""

import time
from io import StringIO
from unittest.mock import patch

import pytest
from django.core.management import call_command

# Needs a real (non-transactional) DB: send_document_to_admins queries
# _admin_chat_ids() from a background thread on its own connection, which
# can't see rows still sitting inside the default test-wrapping transaction
# another connection holds — same reasoning as test_admin_audit.py's
# notify_admin_action tests and test_lessons_backup_on_edit.py.
pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _isolated_backup_dir(monkeypatch, tmp_path):
    # telegrambot.backup.BACKUP_DIR is computed from settings.BASE_DIR at
    # module-import time, so overriding settings.BASE_DIR here would do
    # nothing once another test has already imported that module in this
    # process — patch the already-bound module attribute directly instead,
    # which works regardless of import order.
    monkeypatch.setattr('telegrambot.backup.BACKUP_DIR', tmp_path / 'backups')


def _link(user, chat_id):
    user.telegram_linked = True
    user.telegram_chat_id = chat_id
    user.save()


def _wait_for_calls(mock_post, count=1, timeout=2.0):
    deadline = time.time() + timeout
    while time.time() < deadline and mock_post.call_count < count:
        time.sleep(0.02)


@patch('common.audit.requests.post')
def test_backup_db_sends_the_backup_file_to_telegram(mock_post, make_user, monkeypatch):
    monkeypatch.setenv('BOT_TOKEN', 'test-token')
    admin = make_user('backup-db-admin@example.com', role='admin', approved=True)
    _link(admin, 555)

    out = StringIO()
    call_command('backup_db', stdout=out)

    assert 'Sent to Telegram admins.' in out.getvalue()
    _wait_for_calls(mock_post)
    mock_post.assert_called_once()
    kwargs = mock_post.call_args.kwargs
    assert kwargs['data']['chat_id'] == 555
    filename, payload, content_type = kwargs['files']['document']
    assert filename.startswith('db-') and filename.endswith('.sqlite3.gz')
    assert content_type == 'application/gzip'
    assert len(payload) > 0


@patch('common.audit.requests.post')
def test_backup_db_no_telegram_flag_skips_sending(mock_post, make_user, monkeypatch):
    monkeypatch.setenv('BOT_TOKEN', 'test-token')
    admin = make_user('backup-db-admin2@example.com', role='admin', approved=True)
    _link(admin, 444)

    out = StringIO()
    call_command('backup_db', '--no-telegram', stdout=out)

    assert 'Sent to Telegram admins.' not in out.getvalue()
    mock_post.assert_not_called()


@patch('common.audit.requests.post')
def test_backup_db_without_bot_token_does_not_attempt_send(mock_post, make_user, monkeypatch):
    monkeypatch.delenv('BOT_TOKEN', raising=False)
    admin = make_user('backup-db-admin3@example.com', role='admin', approved=True)
    _link(admin, 333)

    call_command('backup_db', stdout=StringIO())

    mock_post.assert_not_called()
