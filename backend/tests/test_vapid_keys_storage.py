"""VAPID keys stored in the database (webpush.VapidKeys).

backend/.env belongs to www-data and the deploy user cannot write it, so the
deploy provisions the keys with `generate_vapid_keys --db`. What matters:
the environment still wins, the three consumers (public-key endpoint,
sender, dashboard flag) all read through the same helper, the deploy step is
idempotent, and nothing secret reaches stdout — deploy logs are public.
"""

import base64
from io import StringIO

import pytest
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.core.management import call_command
from py_vapid import Vapid01

from webpush.keys import get_vapid_keys, vapid_configured
from webpush.models import PushSubscription, VapidKeys

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def no_env_keys(settings):
    settings.VAPID_PUBLIC_KEY = ''
    settings.VAPID_PRIVATE_KEY = ''


def run(*args):
    out = StringIO()
    call_command('generate_vapid_keys', *args, stdout=out)
    return out.getvalue()


# ── the helper ──────────────────────────────────────────────

def test_nothing_configured_anywhere():
    assert get_vapid_keys() == ('', '')
    assert vapid_configured() is False


def test_falls_back_to_the_database_row():
    VapidKeys.objects.create(public_key='db-pub', private_key='db-priv')
    assert get_vapid_keys() == ('db-pub', 'db-priv')
    assert vapid_configured() is True


def test_environment_wins_over_the_database(settings):
    VapidKeys.objects.create(public_key='db-pub', private_key='db-priv')
    settings.VAPID_PUBLIC_KEY = 'env-pub'
    settings.VAPID_PRIVATE_KEY = 'env-priv'
    assert get_vapid_keys() == ('env-pub', 'env-priv')


def test_half_an_env_pair_is_not_used(settings):
    # A public key without its private half cannot sign anything, so it must
    # not shadow a complete pair further down.
    VapidKeys.objects.create(public_key='db-pub', private_key='db-priv')
    settings.VAPID_PUBLIC_KEY = 'env-pub'
    assert get_vapid_keys() == ('db-pub', 'db-priv')


# ── the command ─────────────────────────────────────────────

def test_db_mode_stores_a_matching_pair():
    run('--db')
    row = VapidKeys.objects.get(pk=1)

    vapid = Vapid01.from_string(row.private_key)
    derived = base64.urlsafe_b64encode(
        vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    ).decode().rstrip('=')
    assert derived == row.public_key
    assert len(row.public_key) == 87


def test_db_mode_prints_only_the_public_key():
    out = run('--db')
    row = VapidKeys.objects.get(pk=1)
    assert row.public_key in out
    assert row.private_key not in out


def test_db_mode_is_idempotent():
    run('--db')
    first = VapidKeys.objects.get(pk=1)
    out = run('--db')

    assert 'already configured' in out
    again = VapidKeys.objects.get(pk=1)
    assert (again.public_key, again.private_key) == (first.public_key, first.private_key)
    assert VapidKeys.objects.count() == 1


def test_db_mode_does_nothing_when_env_already_has_a_pair(settings):
    settings.VAPID_PUBLIC_KEY = 'env-pub'
    settings.VAPID_PRIVATE_KEY = 'env-priv'
    run('--db')
    assert VapidKeys.objects.count() == 0


def test_force_replaces_the_stored_pair():
    run('--db')
    old = VapidKeys.objects.get(pk=1).public_key
    run('--db', '--force')
    assert VapidKeys.objects.get(pk=1).public_key != old
    assert VapidKeys.objects.count() == 1


# ── the three consumers ─────────────────────────────────────

def test_public_key_endpoint_serves_the_stored_key(api_client):
    VapidKeys.objects.create(public_key='db-pub', private_key='db-priv')
    resp = api_client.get('/api/push/vapid-public-key/')
    assert resp.status_code == 200
    assert resp.data == {'publicKey': 'db-pub'}


def test_public_key_endpoint_is_empty_when_unconfigured(api_client):
    assert api_client.get('/api/push/vapid-public-key/').data == {'publicKey': ''}


def test_sender_signs_with_the_stored_private_key(monkeypatch, teacher):
    VapidKeys.objects.create(public_key='db-pub', private_key='db-priv')
    sub = PushSubscription.objects.create(user=teacher, endpoint='https://push.example/1', p256dh='p', auth='a')
    seen = {}
    monkeypatch.setattr('webpush.send.webpush', lambda **kwargs: seen.update(kwargs))

    from webpush.send import send_web_push

    assert send_web_push(sub, {'title': 't'}) is True
    assert seen['vapid_private_key'] == 'db-priv'


def test_sender_skips_quietly_without_keys(monkeypatch, teacher):
    sub = PushSubscription.objects.create(user=teacher, endpoint='https://push.example/2', p256dh='p', auth='a')

    def boom(**kwargs):
        raise AssertionError('must not try to send without keys')

    monkeypatch.setattr('webpush.send.webpush', boom)

    from webpush.send import send_web_push

    assert send_web_push(sub, {'title': 't'}) is False


def test_dashboard_push_flag_sees_the_stored_pair(as_user, admin):
    assert as_user(admin).get('/api/dashboard/summary/').data['engagement']['push_configured'] is False
    VapidKeys.objects.create(public_key='db-pub', private_key='db-priv')
    assert as_user(admin).get('/api/dashboard/summary/').data['engagement']['push_configured'] is True
