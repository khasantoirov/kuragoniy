"""Telegram mini app sign-in (accounts/tg_webapp.py): Telegram's initData,
signed with the bot's token, opens the account linked to that Telegram;
anything forged, stale or unlinked doesn't (owner, 2026-11-28)."""

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest

from accounts.models import User
from accounts.tg_webapp import verify

TOKEN = '123456:TEST-token'

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def bot_token(monkeypatch):
    monkeypatch.setenv('BOT_TOKEN', TOKEN)


def init_data(tg_id=777, *, token=TOKEN, age=0, **extra):
    fields = {
        'auth_date': str(int(time.time()) - age),
        'query_id': 'AAE1',
        'user': json.dumps({'id': tg_id, 'first_name': 'Hasan', 'username': 'hasan_t'}, separators=(',', ':')),
        **extra,
    }
    check = '\n'.join(f'{k}={v}' for k, v in sorted(fields.items()))
    secret = hmac.new(b'WebAppData', token.encode(), hashlib.sha256).digest()
    fields['hash'] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_verify_takes_only_genuine_fresh_data():
    assert verify(init_data())['id'] == 777
    assert verify(init_data(token='999:other')) is None          # another bot's
    assert verify(init_data(age=2 * 24 * 3600)) is None           # too old
    assert verify(init_data().replace('Hasan', 'Hasaan')) is None  # tampered
    assert verify('') is None and verify('user=1') is None


def test_a_linked_telegram_signs_in_without_the_password(api_client, teacher):
    User.objects.filter(pk=teacher.pk).update(telegram_chat_id=777, telegram_linked=True)
    resp = api_client.post('/api/auth/telegram/', {'init_data': init_data()}, format='json')
    assert resp.status_code == 200, resp.data
    assert resp.data['access'] and resp.data['user']['id'] == str(teacher.pk)
    assert 'refresh_token' in resp.cookies


def test_an_unlinked_or_forged_one_does_not(api_client, teacher):
    resp = api_client.post('/api/auth/telegram/', {'init_data': init_data()}, format='json')
    assert resp.status_code == 404 and resp.data['code'] == 'not_linked'
    User.objects.filter(pk=teacher.pk).update(telegram_chat_id=777, telegram_linked=True)
    resp = api_client.post('/api/auth/telegram/', {'init_data': init_data(token='1:x')}, format='json')
    assert resp.status_code == 400 and 'refresh_token' not in resp.cookies
    # a link that was taken back (/stop in the bot) no longer opens the account
    User.objects.filter(pk=teacher.pk).update(telegram_linked=False)
    assert api_client.post('/api/auth/telegram/', {'init_data': init_data()}, format='json').status_code == 404


def test_signing_in_with_the_password_links_this_telegram(as_user, teacher, make_user):
    resp = as_user(teacher).post('/api/accounts/me/telegram-webapp/', {'init_data': init_data()}, format='json')
    assert resp.status_code == 200, resp.data
    teacher.refresh_from_db()
    assert teacher.telegram_linked and teacher.telegram_chat_id == 777 and teacher.telegram_username == 'hasan_t'
    # someone else's Telegram is never taken over
    other = make_user('other@x.uz', approved=True)
    resp = as_user(other).post('/api/accounts/me/telegram-webapp/', {'init_data': init_data()}, format='json')
    assert resp.status_code == 409
    other.refresh_from_db()
    assert other.telegram_chat_id is None


def test_the_panel_address_still_takes_admins_only(api_client, teacher, settings):
    settings.ADMIN_HOSTS = ['admin.kuragoniy.uz']
    settings.ALLOWED_HOSTS = ['testserver', 'admin.kuragoniy.uz']
    User.objects.filter(pk=teacher.pk).update(telegram_chat_id=777, telegram_linked=True)
    resp = api_client.post('/api/auth/telegram/', {'init_data': init_data()}, format='json', HTTP_HOST='admin.kuragoniy.uz')
    assert resp.status_code == 403 and resp.data['code'] == 'not_admin'
