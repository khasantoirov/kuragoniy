"""Off-server backup copies are encrypted when BACKUP_ENCRYPTION_KEY is
set, and `decrypt_backup` restores them byte-for-byte."""

import gzip
from io import StringIO
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from django.core.management import call_command

pytestmark = pytest.mark.django_db(transaction=True)


@pytest.fixture(autouse=True)
def _isolated_backup_dir(monkeypatch, tmp_path):
    monkeypatch.setattr('telegrambot.backup.BACKUP_DIR', tmp_path / 'backups')


def test_telegram_copy_is_encrypted_and_decryptable(monkeypatch, tmp_path):
    key = Fernet.generate_key().decode()
    monkeypatch.setenv('BACKUP_ENCRYPTION_KEY', key)
    sent = {}

    def fake_send(name, payload, caption, content_type='', include_boshliq=True):
        sent.update(name=name, payload=payload, caption=caption)

    with patch('common.audit.send_document_to_admins', fake_send):
        call_command('backup_db', stdout=StringIO())

    assert sent['name'].endswith('.sqlite3.gz.enc')
    assert not sent['payload'].startswith(b'\x1f\x8b')  # not a readable gzip
    enc = tmp_path / sent['name']
    enc.write_bytes(sent['payload'])
    call_command('decrypt_backup', str(enc), stdout=StringIO())
    restored = enc.with_suffix('')
    assert gzip.decompress(restored.read_bytes()).startswith(b'SQLite format 3')


def test_wrong_key_refused(tmp_path):
    from django.core.management.base import CommandError

    enc = tmp_path / 'x.enc'
    enc.write_bytes(Fernet(Fernet.generate_key()).encrypt(b'data'))
    with pytest.raises(CommandError):
        call_command('decrypt_backup', str(enc), key=Fernet.generate_key().decode(), stdout=StringIO())
