"""Signing in with a phone number through the Telegram bot (sign-in only:
nobody signs up by phone; brought back 2026-11-26)."""
from unittest.mock import patch

import pytest
from django.core.cache import cache

from accounts import phone_auth
from accounts.models import PhoneVerification, User

START = '/api/auth/phone/start/'
VERIFY = '/api/auth/phone/verify/'


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
def test_an_unknown_number_is_sent_to_the_password(api_client):
    r = api_client.post(START, {'phone': '90 111 22 33'}, format='json')
    assert r.status_code == 404 and r.data['step'] == 'password'
    assert not PhoneVerification.objects.exists()
    # and there is no sign-up by phone any more
    assert api_client.post('/api/auth/phone/register/', {'phone': '+998901112233'}, format='json').status_code == 404


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
@patch('accounts.phone_views.send_telegram_message')
def test_the_admin_panel_takes_no_phone_sign_in_but_an_admins(mock_send, api_client, settings, teacher, admin):
    settings.ADMIN_HOSTS = ['admin.kuragoniy.uz']
    settings.ALLOWED_HOSTS = ['testserver', 'admin.kuragoniy.uz']
    User.objects.filter(pk=teacher.pk).update(phone='+998901112299', telegram_linked=True, telegram_chat_id=555)
    User.objects.filter(pk=admin.pk).update(phone='+998901112200', telegram_linked=True, telegram_chat_id=556)
    host = {'HTTP_HOST': 'admin.kuragoniy.uz'}
    r = api_client.post(START, {'phone': '+998901112299'}, format='json', **host)
    assert r.status_code == 403 and r.data['code'] == 'not_admin'
    assert not mock_send.called  # no code goes out for the panel
    # a ticket started on kuragoniy.uz doesn't open the panel either
    ticket = api_client.post(START, {'phone': '+998901112299'}, format='json').data['ticket']
    r = api_client.post(VERIFY, {'ticket': ticket, 'code': _sent_code(mock_send)}, format='json', **host)
    assert r.status_code == 403
    # an admin gets in
    ticket = api_client.post(START, {'phone': '+998901112200'}, format='json', **host).data['ticket']
    r = api_client.post(VERIFY, {'ticket': ticket, 'code': _sent_code(mock_send)}, format='json', **host)
    assert r.status_code == 200 and r.data['user']['id'] == admin.id
