"""manage.py generate_vapid_keys — provisions web-push keys.

The deploy runs it with --write on every release, so what matters is that
it is idempotent (never rotates keys that exist — that would silently
break every subscription), that the private key never reaches stdout in
that mode (deploy logs are visible on GitHub), and that the pair it
writes is actually a matching pair the sender can sign with.
"""

import base64
from io import StringIO

import pytest
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.core.management import call_command
from django.core.management.base import CommandError
from py_vapid import Vapid01


@pytest.fixture
def env_dir(settings, tmp_path):
    """Point BASE_DIR at a scratch dir and start with no keys configured."""
    settings.BASE_DIR = tmp_path
    settings.VAPID_PUBLIC_KEY = ''
    settings.VAPID_PRIVATE_KEY = ''
    return tmp_path


def run(*args):
    out = StringIO()
    call_command('generate_vapid_keys', *args, stdout=out)
    return out.getvalue()


def read_env(env_dir):
    values = {}
    for line in (env_dir / '.env').read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            values[k] = v
    return values


def test_write_puts_a_matching_pair_in_env(env_dir):
    run('--write')
    env = read_env(env_dir)

    # The private key must derive exactly the public key that was published,
    # otherwise the browser subscribes against one key and the server signs
    # with another and every push is rejected.
    vapid = Vapid01.from_string(env['VAPID_PRIVATE_KEY'])
    derived = base64.urlsafe_b64encode(
        vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    ).decode().rstrip('=')
    assert derived == env['VAPID_PUBLIC_KEY']
    assert len(env['VAPID_PUBLIC_KEY']) == 87  # uncompressed P-256 point


def test_write_never_prints_the_private_key(env_dir):
    out = run('--write')
    private = read_env(env_dir)['VAPID_PRIVATE_KEY']
    assert private not in out
    assert read_env(env_dir)['VAPID_PUBLIC_KEY'] in out


def test_write_is_a_no_op_when_keys_already_exist(env_dir, settings):
    settings.VAPID_PUBLIC_KEY = 'existing-public'
    settings.VAPID_PRIVATE_KEY = 'existing-private'
    (env_dir / '.env').write_text('FOO=bar\n', encoding='utf-8')

    out = run('--write')

    assert 'already configured' in out
    assert (env_dir / '.env').read_text(encoding='utf-8') == 'FOO=bar\n'


def test_force_replaces_existing_keys(env_dir, settings):
    settings.VAPID_PUBLIC_KEY = 'existing-public'
    settings.VAPID_PRIVATE_KEY = 'existing-private'
    (env_dir / '.env').write_text(
        'VAPID_PUBLIC_KEY=existing-public\nVAPID_PRIVATE_KEY=existing-private\n', encoding='utf-8'
    )

    run('--write', '--force')

    env = read_env(env_dir)
    assert env['VAPID_PUBLIC_KEY'] != 'existing-public'
    assert env['VAPID_PRIVATE_KEY'] != 'existing-private'


def test_write_drops_stale_empty_entries_and_keeps_everything_else(env_dir):
    # An empty VAPID_PUBLIC_KEY= left above the new one would win under
    # django-environ (first assignment kept) and shadow the real key.
    (env_dir / '.env').write_text(
        'DJANGO_SECRET_KEY=abc\nVAPID_PUBLIC_KEY=\nVAPID_PRIVATE_KEY=\nALLOWED=x\n', encoding='utf-8'
    )

    run('--write')

    text = (env_dir / '.env').read_text(encoding='utf-8')
    assert text.count('VAPID_PUBLIC_KEY=') == 1
    assert text.count('VAPID_PRIVATE_KEY=') == 1
    env = read_env(env_dir)
    assert env['VAPID_PUBLIC_KEY'] and env['VAPID_PRIVATE_KEY']
    assert env['DJANGO_SECRET_KEY'] == 'abc'
    assert env['ALLOWED'] == 'x'


def test_write_creates_env_when_missing(env_dir):
    assert not (env_dir / '.env').exists()
    run('--write')
    assert read_env(env_dir)['VAPID_PUBLIC_KEY']


def test_print_mode_leaves_env_untouched(env_dir):
    out = run()
    assert 'VAPID_PUBLIC_KEY=' in out and 'VAPID_PRIVATE_KEY=' in out
    assert not (env_dir / '.env').exists()


def _deny(*args, **kwargs):
    raise PermissionError('nope')


def test_unwritable_existing_env_fails_with_an_actionable_error(env_dir, monkeypatch):
    (env_dir / '.env').write_text('FOO=bar\n', encoding='utf-8')
    monkeypatch.setattr('builtins.open', _deny)
    with pytest.raises(CommandError) as exc:
        run('--write')
    assert 'generate_vapid_keys' in str(exc.value)


def test_uncreatable_env_fails_with_an_actionable_error(env_dir, monkeypatch):
    monkeypatch.setattr('os.open', _deny)
    with pytest.raises(CommandError) as exc:
        run('--write')
    assert 'generate_vapid_keys' in str(exc.value)


def test_unreadable_env_fails_with_an_actionable_error(env_dir, monkeypatch):
    # The real-world failure: .env belongs to another user, so it cannot even
    # be read. That used to escape as a raw traceback; it must be a clear
    # message naming the file and the command to run as root instead.
    (env_dir / '.env').write_text('FOO=bar\n', encoding='utf-8')
    monkeypatch.setattr('pathlib.Path.read_text', _deny)

    with pytest.raises(CommandError) as exc:
        run('--write')

    message = str(exc.value)
    assert '.env' in message
    assert 'sudo ./venv/bin/python manage.py generate_vapid_keys --write' in message
