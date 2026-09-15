"""A linked teacher's plain-text message to the bot relays to every
linked admin/boshliq/dev-superuser except the sender — see
telegrambot/bot/replies.py. Only the pure DB-query half is tested here
(_sender_and_recipients_sync); the aiogram handler itself just wraps it
with message.answer()/bot.send_message() calls.
"""

import pytest

from telegrambot.bot.replies import _compose_relay_text, _sender_and_recipients_sync

pytestmark = pytest.mark.django_db


# ── HTML escaping (any linked teacher's free text reaches every admin) ──
# Telegram's bot sends with parse_mode=HTML; unescaped '<'/'>'/'&' in the
# sender's name or message either breaks delivery outright ("can't parse
# entities") or lets the sender format/link-inject into what every admin
# sees, since neither field is admin-authored or otherwise trusted input.

def test_relay_text_escapes_html_in_sender_name():
    text = _compose_relay_text("<b>Evil</b>", "hello")
    assert "<b>Evil</b>" not in text
    assert "&lt;b&gt;Evil&lt;/b&gt;" in text


def test_relay_text_escapes_html_in_message_body():
    text = _compose_relay_text("Ivan", "x < 5 & y > 2")
    assert "x < 5 & y > 2" not in text
    assert "x &lt; 5 &amp; y &gt; 2" in text


def test_relay_text_neutralizes_injected_link():
    text = _compose_relay_text("Ivan", '<a href="https://evil.example">click</a>')
    assert "<a href" not in text


def _link(user, chat_id):
    user.telegram_linked = True
    user.telegram_chat_id = chat_id
    user.save()


def test_unlinked_chat_has_no_sender(db):
    sender, recipients = _sender_and_recipients_sync(999999)
    assert sender is None
    assert recipients == []


def test_teacher_message_relays_to_admin_and_boshliq_but_not_other_teachers(make_user):
    teacher = make_user('teacher@example.com')
    _link(teacher, 111)

    admin = make_user('admin@example.com', role='admin')
    _link(admin, 222)

    boshliq = make_user('boshliq@example.com', role='boshliq')
    _link(boshliq, 333)

    other_teacher = make_user('other-teacher@example.com')
    _link(other_teacher, 444)

    sender, recipients = _sender_and_recipients_sync(111)
    assert sender == teacher
    assert set(recipients) == {222, 333}


def test_sender_is_excluded_even_if_they_are_an_admin(make_user):
    admin = make_user('admin2@example.com', role='admin')
    _link(admin, 555)
    other_admin = make_user('admin3@example.com', role='admin')
    _link(other_admin, 666)

    sender, recipients = _sender_and_recipients_sync(555)
    assert sender == admin
    assert list(recipients) == [666]


def test_dev_superuser_receives_relayed_messages_too(make_user):
    teacher = make_user('teacher2@example.com')
    _link(teacher, 777)
    dev = make_user('dev2@example.com', is_dev_superuser=True)
    _link(dev, 888)

    _, recipients = _sender_and_recipients_sync(777)
    assert list(recipients) == [888]


def test_unlinked_admin_is_not_a_recipient(make_user):
    teacher = make_user('teacher3@example.com')
    _link(teacher, 100)
    # Admin exists but never connected Telegram — nothing to send to.
    make_user('admin4@example.com', role='admin')

    _, recipients = _sender_and_recipients_sync(100)
    assert recipients == []
