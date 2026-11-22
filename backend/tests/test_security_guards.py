"""The protections that replaced Google reCAPTCHA (2026-11-22): the public
forms' bot check (common/formguard.py), the IP password-spraying block
(common/loginguard.py) and the leaders' Telegram step (accounts/tg_step.py)."""

import re
from unittest.mock import patch

import pytest
from django.core.cache import cache

from accounts import tg_step
from accounts.models import User
from common import formguard

LOGIN = '/api/auth/login/'
GUARD = '/api/auth/guard/'
TG = '/api/auth/login/telegram/'

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


# --- the leaders' Telegram step --------------------------------------------

@pytest.fixture
def leader(settings, admin):
    cache.clear()
    settings.LEADER_TELEGRAM_STEP = True
    User.objects.filter(pk=admin.pk).update(telegram_linked=True, telegram_chat_id=777)
    admin.refresh_from_db()
    return admin


@pytest.fixture
def bot():
    sent = []
    with patch.object(tg_step, '_send', side_effect=lambda chat, text: sent.append((chat, text)) or True):
        yield sent


def code_in(text):
    return re.search(r'\b(\d{6})\b', text).group(1)


def test_a_leader_on_a_new_browser_confirms_with_a_telegram_code(api_client, leader, bot):
    creds = {'login': leader.username, 'password': 'testpass123'}
    r = api_client.post(LOGIN, creds, format='json')
    assert r.status_code == 200 and r.data['telegram_required'] and 'access' not in r.data
    (chat, text), = bot
    assert chat == 777 and 'kirish kodi' in text

    assert api_client.post(TG, {'challenge': r.data['challenge'], 'code': '000000' if code_in(text) != '000000' else '111111'},
                           format='json').status_code == 400
    ok = api_client.post(TG, {'challenge': r.data['challenge'], 'code': code_in(text)}, format='json')
    assert ok.status_code == 200 and ok.data['access']
    assert tg_step.cookie_name(leader) in ok.cookies

    # the browser is known now: straight in, no code
    again = api_client.post(LOGIN, creds, format='json')
    assert again.status_code == 200 and again.data.get('access') and len(bot) == 1

    # a new password makes every browser confirm again
    leader.set_password('another-pass-456')
    leader.save()
    r = api_client.post(LOGIN, {'login': leader.username, 'password': 'another-pass-456'}, format='json')
    assert r.data.get('telegram_required')


def test_a_used_or_guessed_code_runs_out(api_client, leader, bot):
    r = api_client.post(LOGIN, {'login': leader.username, 'password': 'testpass123'}, format='json')
    right = code_in(bot[0][1])
    wrong = '000000' if right != '000000' else '111111'
    for _ in range(tg_step.MAX_ATTEMPTS):
        assert api_client.post(TG, {'challenge': r.data['challenge'], 'code': wrong}, format='json').status_code in (400, 429)
    # five wrong tries: even the right code is too late
    assert api_client.post(TG, {'challenge': r.data['challenge'], 'code': right}, format='json').status_code in (401, 429)


def test_teachers_and_unlinked_or_unreachable_leaders_sign_in_as_before(api_client, leader, teacher, settings):
    with patch.object(tg_step, '_send', return_value=True) as send:
        r = api_client.post(LOGIN, {'login': teacher.username, 'password': 'testpass123'}, format='json')
        assert r.status_code == 200 and r.data.get('access')
        assert not send.called
    # Telegram can't be reached: never a lock-out by our own fault
    with patch.object(tg_step, '_send', return_value=False):
        r = api_client.post(LOGIN, {'login': leader.username, 'password': 'testpass123'}, format='json')
        assert r.status_code == 200 and r.data.get('access')
    # no Telegram linked: nothing to send to
    User.objects.filter(pk=leader.pk).update(telegram_linked=False, telegram_chat_id=None)
    with patch.object(tg_step, '_send', return_value=True) as send:
        r = api_client.post(LOGIN, {'login': leader.username, 'password': 'testpass123'}, format='json')
        assert r.data.get('access') and not send.called


def test_an_authenticator_app_is_already_the_second_step(api_client, leader, bot):
    User.objects.filter(pk=leader.pk).update(totp_enabled=True, totp_secret='JBSWY3DPEHPK3PXP')
    r = api_client.post(LOGIN, {'login': leader.username, 'password': 'testpass123'}, format='json')
    assert r.data.get('totp_required') and not r.data.get('telegram_required') and bot == []
