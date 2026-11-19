"""Signing in / up with a phone number through the Telegram bot."""
from unittest.mock import patch

import pytest
from django.core.cache import cache

from accounts import phone_auth
from accounts.models import PhoneVerification, User

START = '/api/auth/phone/start/'
REGISTER = '/api/auth/phone/register/'
VERIFY = '/api/auth/phone/verify/'
COMPLETE = '/api/auth/phone/complete/'


@pytest.fixture(autouse=True)
def fresh_throttles():
    cache.clear()
    yield
    cache.clear()


def _sent_code(mock_send):
    """The 6-digit code in the last Telegram message the site sent."""
    text = mock_send.call_args[0][1]
    return next(w.strip('.,:') for w in text.split() if w.strip('.,:').isdigit() and len(w.strip('.,:')) == 6)


@pytest.mark.django_db
def test_an_unknown_number_goes_to_sign_up(api_client):
    r = api_client.post(START, {'phone': '90 111 22 33'}, format='json')
    assert r.status_code == 200 and r.data == {'step': 'register', 'phone': '+998901112233'}


@pytest.mark.django_db
def test_sign_up_through_the_bot(api_client):
    r = api_client.post(REGISTER, {'phone': '+998 90 111 22 33', 'first_name': 'ali', 'last_name': 'valiyev'}, format='json')
    assert r.status_code == 200 and r.data['step'] == 'telegram' and '?start=ph_' in r.data['bot_url']
    ticket = r.data['ticket']
    v = PhoneVerification.objects.get(ticket=ticket)

    # the person opens the bot, then shares their own contact
    assert phone_auth.claim_from_bot(v.link_token, 111, 'ali_v') is not None
    status, _, code = phone_auth.contact_from_bot(111, '998901112233', 555, 555, 'ali_v')
    assert status == 'sent' and len(code) == 6

    r = api_client.post(VERIFY, {'ticket': ticket, 'code': code}, format='json')
    assert r.data == {'step': 'password', 'ticket': ticket}
    r = api_client.post(COMPLETE, {'ticket': ticket, 'password': 'Kuchli-parol-2026'}, format='json')
    assert r.status_code == 200 and r.data['access']
    user = User.objects.get(phone='+998901112233')
    assert user.approved is False and user.role == User.Role.TEACHER
    assert user.name == 'Ali Valiyev' and user.username and user.email is None
    assert user.telegram_linked and user.telegram_chat_id == 111
    # the ticket is spent
    assert api_client.post(COMPLETE, {'ticket': ticket, 'password': 'Kuchli-parol-2026'}, format='json').status_code == 410


@pytest.mark.django_db
@patch('accounts.phone_views.send_telegram_message')
def test_a_linked_account_gets_its_code_at_once(mock_send, api_client, teacher):
    User.objects.filter(pk=teacher.pk).update(phone='+998901112244', telegram_linked=True, telegram_chat_id=222)
    r = api_client.post(START, {'phone': '901112244'}, format='json')
    assert r.data['step'] == 'code'
    assert mock_send.call_args[0][0] == 222
    r = api_client.post(VERIFY, {'ticket': r.data['ticket'], 'code': _sent_code(mock_send)}, format='json')
    assert r.status_code == 200 and r.data['access'] and r.data['user']['id'] == teacher.id


@pytest.mark.django_db
def test_an_unlinked_account_proves_the_number_in_the_bot(api_client, teacher):
    User.objects.filter(pk=teacher.pk).update(phone='+998901112255')
    r = api_client.post(START, {'phone': '+998901112255'}, format='json')
    assert r.data['step'] == 'telegram'
    v = PhoneVerification.objects.get(ticket=r.data['ticket'])
    phone_auth.claim_from_bot(v.link_token, 333, None)
    # someone else's contact, or another number, is refused
    assert phone_auth.contact_from_bot(333, '+998901112255', 999, 333, None)[0] == 'not_own'
    assert phone_auth.contact_from_bot(333, '+998907777777', 333, 333, None)[0] == 'mismatch'
    status, _, code = phone_auth.contact_from_bot(333, '+998901112255', 333, 333, 'teach')
    assert status == 'sent'
    teacher.refresh_from_db()
    assert teacher.telegram_chat_id == 333 and teacher.telegram_linked  # linked on the way
    r = api_client.post(VERIFY, {'ticket': v.ticket, 'code': code}, format='json')
    assert r.data['user']['id'] == teacher.id


@pytest.mark.django_db
@patch('accounts.phone_views.send_telegram_message')
def test_wrong_codes_use_up_the_tries(mock_send, api_client, teacher):
    User.objects.filter(pk=teacher.pk).update(phone='+998901112266', telegram_linked=True, telegram_chat_id=444)
    ticket = api_client.post(START, {'phone': '+998901112266'}, format='json').data['ticket']
    good = _sent_code(mock_send)
    bad = '000000' if good != '000000' else '111111'
    for _ in range(PhoneVerification.MAX_ATTEMPTS):
        assert api_client.post(VERIFY, {'ticket': ticket, 'code': bad}, format='json').status_code == 400
    assert api_client.post(VERIFY, {'ticket': ticket, 'code': good}, format='json').status_code == 400


@pytest.mark.django_db
def test_a_number_on_two_accounts_falls_back_to_the_password(api_client, make_user):
    for email in ('a@test.uz', 'b@test.uz'):
        u = make_user(email, approved=True)
        User.objects.filter(pk=u.pk).update(phone='+998901112277')
    r = api_client.post(START, {'phone': '+998901112277'}, format='json')
    assert r.status_code == 409 and r.data['step'] == 'password'


@pytest.mark.django_db
def test_sign_up_refuses_a_number_already_registered(api_client, teacher):
    User.objects.filter(pk=teacher.pk).update(phone='+998901112288')
    r = api_client.post(REGISTER, {'phone': '+998901112288', 'first_name': 'Ali', 'last_name': 'Valiyev'}, format='json')
    assert r.status_code == 409 and r.data['step'] == 'login'


@pytest.mark.django_db
def test_recaptcha_guards_the_forms_once_keys_are_set(api_client, settings):
    settings.RECAPTCHA_SECRET_KEY = 'secret'
    with patch('common.captcha.requests.post') as post:
        post.return_value.json.return_value = {'success': True, 'score': 0.1, 'action': 'phone_start'}
        assert api_client.post(START, {'phone': '+998901112299', 'captcha': 't'}, format='json').status_code == 400
        post.return_value.json.return_value = {'success': True, 'score': 0.9, 'action': 'phone_start'}
        assert api_client.post(START, {'phone': '+998901112299', 'captcha': 't'}, format='json').status_code == 200
    # no token at all
    assert api_client.post(START, {'phone': '+998901112299'}, format='json').status_code == 400


@pytest.mark.django_db
def test_recaptcha_trial_run_and_our_own_mistakes_never_lock_people_out(api_client, settings):
    settings.RECAPTCHA_SECRET_KEY = 'secret'
    with patch('common.captcha.requests.post') as post:
        # a wrong secret key is our mistake: let people in, say so in the log
        post.return_value.json.return_value = {'success': False, 'error-codes': ['invalid-input-secret']}
        assert api_client.post(START, {'phone': '+998901112300', 'captcha': 't'}, format='json').status_code == 200
        # Google out of reach: same
        post.side_effect = ConnectionError('down')
        assert api_client.post(START, {'phone': '+998901112300', 'captcha': 't'}, format='json').status_code == 200
        post.side_effect = None
        # a bad token is the visitor's: refused
        post.return_value.json.return_value = {'success': False, 'error-codes': ['invalid-input-response']}
        assert api_client.post(START, {'phone': '+998901112300', 'captcha': 't'}, format='json').status_code == 400
        # the trial run refuses nobody
        settings.RECAPTCHA_ENFORCE = False
        assert api_client.post(START, {'phone': '+998901112300', 'captcha': 't'}, format='json').status_code == 200
        assert api_client.post(START, {'phone': '+998901112300'}, format='json').status_code == 200
