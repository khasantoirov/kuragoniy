"""The protections that replaced Google reCAPTCHA (2026-11-22): the public
forms' bot check (common/formguard.py) and the IP password-spraying block
(common/loginguard.py). The leaders' Telegram step was taken out again the
same day at the owner's request."""

from unittest.mock import patch

import pytest
from django.core.cache import cache

from accounts.models import User
from common import formguard

LOGIN = '/api/auth/login/'
GUARD = '/api/auth/guard/'

pytestmark = pytest.mark.django_db


@pytest.fixture
def guarded(settings):
    cache.clear()
    settings.FORM_GUARD_ENABLED = True
    settings.FORM_GUARD_ENFORCE = True
    settings.FORM_GUARD_BITS = 8  # quick to solve in a test
    settings.FORM_GUARD_MIN_SECONDS = 0
    return settings


def proof(client, action):
    c = client.get(GUARD, {'a': action}).data
    nonce = next(n for n in range(10 ** 6) if formguard.solved(c['salt'], n, c['bits']))
    return {'token': c['token'], 'nonce': nonce}


# --- the bot check ---------------------------------------------------------

def test_a_challenge_per_form(api_client, guarded):
    r = api_client.get(GUARD, {'a': 'login'})
    assert r.status_code == 200 and r.data['bits'] == 8 and r.data['salt'] and r.data['token']
    assert r['Cache-Control'] == 'no-store'
    assert api_client.get(GUARD, {'a': 'anything'}).status_code == 400


def test_sign_in_needs_a_solved_challenge_once(api_client, guarded, teacher):
    creds = {'login': teacher.username, 'password': 'testpass123'}
    r = api_client.post(LOGIN, creds, format='json')
    assert r.status_code == 400 and r.data['detail'] == formguard.FAILED

    p = proof(api_client, 'login')
    assert api_client.post(LOGIN, {**creds, 'guard': p}, format='json').status_code == 200
    # the same proof works once
    assert api_client.post(LOGIN, {**creds, 'guard': p}, format='json').status_code == 400


def test_a_bot_is_caught(api_client, guarded, teacher):
    creds = {'login': teacher.username, 'password': 'testpass123'}
    # the hidden trap filled in
    r = api_client.post(LOGIN, {**creds, 'guard': proof(api_client, 'login'), 'ke_hp': 'http://spam'}, format='json')
    assert r.status_code == 400
    # a proof made for another form
    assert api_client.post(LOGIN, {**creds, 'guard': proof(api_client, 'lead')}, format='json').status_code == 400
    # a nonce that doesn't solve it
    p = proof(api_client, 'login')
    bad = next(n for n in range(10 ** 6) if not formguard.solved(formguard.signing.loads(p['token'], salt=formguard.SALT)['s'], n, 8))
    assert api_client.post(LOGIN, {**creds, 'guard': {**p, 'nonce': bad}}, format='json').status_code == 400
    # a forged token
    assert api_client.post(LOGIN, {**creds, 'guard': {'token': 'x:y:z', 'nonce': 1}}, format='json').status_code == 400


def test_too_fast_is_a_script(api_client, guarded, teacher):
    guarded.FORM_GUARD_MIN_SECONDS = 30
    creds = {'login': teacher.username, 'password': 'testpass123', 'guard': proof(api_client, 'login')}
    assert api_client.post(LOGIN, creds, format='json').status_code == 400


def test_the_emergency_switch_refuses_nobody(api_client, guarded, teacher):
    guarded.FORM_GUARD_ENFORCE = False
    r = api_client.post(LOGIN, {'login': teacher.username, 'password': 'testpass123'}, format='json')
    assert r.status_code == 200


@pytest.mark.parametrize('url, action, body', [
    ('/api/auth/phone/start/', 'phone_start', {'phone': '+998901112233'}),
    ('/api/auth/phone/register/', 'phone_register', {'phone': '+998901112234', 'first_name': 'Ali', 'last_name': 'Valiyev'}),
    ('/api/auth/password-reset/request/', 'password_reset', {'login': 'nobody'}),
    ('/api/public/leads/', 'lead', {'name': 'Ali Valiyev', 'phone': '+998901112235'}),
    ('/api/student/register/', 'student_register', {'code': 'NOPE1234'}),
])
@patch('accounts.phone_views.send_telegram_message')
def test_every_public_form_is_guarded(_send, api_client, guarded, url, action, body):
    r = api_client.post(url, body, format='json')
    assert r.status_code == 400 and r.data.get('detail') == formguard.FAILED
    r = api_client.post(url, {**body, 'guard': proof(api_client, action)}, format='json')
    assert (r.data or {}).get('detail') != formguard.FAILED


# --- password spraying from one address ------------------------------------

@patch('common.audit.send_telegram_message')
def test_spraying_from_one_address_blocks_password_sign_in_there(send, api_client, settings, teacher, admin):
    cache.clear()
    settings.LOGIN_IP_THRESHOLD = 3
    User.objects.filter(pk=admin.pk).update(telegram_linked=True, telegram_chat_id=4242)
    here = {'HTTP_X_REAL_IP': '203.0.113.7'}

    # one account tried again and again is the per-account lock-out's job
    for _ in range(3):
        assert api_client.post(LOGIN, {'login': 'ghost', 'password': 'x'}, format='json', **here).status_code == 401
    assert api_client.post(LOGIN, {'login': 'ghost2', 'password': 'x'}, format='json', **here).status_code == 401
    r = api_client.post(LOGIN, {'login': 'ghost3', 'password': 'x'}, format='json', **here)
    assert r.status_code == 429 and r.data['ip_blocked']

    # now even the right password waits — from that address only
    assert api_client.post(LOGIN, {'login': teacher.username, 'password': 'testpass123'}, format='json', **here).status_code == 429
    elsewhere = {'HTTP_X_REAL_IP': '198.51.100.20'}
    assert api_client.post(LOGIN, {'login': teacher.username, 'password': 'testpass123'}, format='json', **elsewhere).status_code == 200

    # the administration heard about it, once
    assert send.call_count == 1 and send.call_args[0][0] == 4242 and '203.0.113.7' in send.call_args[0][1]
    assert api_client.post(LOGIN, {'login': 'ghost4', 'password': 'x'}, format='json', **here).status_code == 429
    assert send.call_count == 1
