"""2026-11-28: «Boshliq» is called «Rahbar» (the role key stays 'boshliq');
a sign-in from the Telegram mini app is described as Telegram; /start from
a linked chat greets by name; the security kind no longer mentions 2FA."""

import pytest

from accounts.models import User
from common.useragent import parse_hints, summarize
from common.viewas import ROLE_LABELS
from notifications.models import Kind
from notifications.prefs import DESCRIPTIONS
from telegrambot.bot import handlers

EDGE = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/158.0.0.0 Safari/537.36 Edg/158.0.0.0')


def test_role_label_is_rahbar_key_unchanged():
    assert User.Role.BOSHLIQ.value == 'boshliq'
    assert User.Role.BOSHLIQ.label == 'Rahbar'
    assert ROLE_LABELS['boshliq'] == 'Rahbar'


def test_mini_app_sign_in_says_telegram():
    hints = parse_hints('pv=19.0.0&app=telegram')
    assert hints['app'] == 'telegram'
    info = summarize(EDGE, hints)
    assert info['browser_full'] == 'Telegram (mini ilova)'
    assert info['os_full'] == 'Windows 11'
    # the plain browser on the same computer is still Edge
    assert summarize(EDGE, parse_hints('pv=19.0.0'))['browser'] == 'Edge'


def test_security_kind_no_two_factor():
    assert 'ikki bosqichli' not in DESCRIPTIONS[Kind.XAVFSIZLIK]


@pytest.mark.django_db
def test_start_knows_a_linked_chat():
    User.objects.create_user(username='t1', email='t1@example.com', password='x', first_name='Hasan',
                             telegram_linked=True, telegram_chat_id=4242)
    assert handlers._linked_name.func(4242) == 'Hasan'
    assert handlers._linked_name.func(1) is None
