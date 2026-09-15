"""Every outgoing Telegram message in this codebase is sent with
parse_mode=HTML (aiogram's bot-wide default — see telegrambot/bot/main.py).
A bare '<', '>' or '&' from user-editable content (a lesson/announcement
title, a display name, a free-typed message) breaks Telegram's HTML parser
and silently drops the send for every recipient at once, and unescaped
input could otherwise inject real formatting/links. These are the pure
message-composition helpers behind that escaping — see
common/audit.py::_compose_message and
telegrambot/bot/announcements.py::_compose_announcement_message.
"""

from unittest.mock import Mock

from common.audit import _compose_message
from telegrambot.bot.announcements import _compose_announcement_message


def test_audit_message_escapes_html_in_free_text():
    actor = Mock(is_authenticated=True, name="Admin", get_role_display=lambda: "")
    actor.name = "Admin"
    message = _compose_message(actor, "Dars nomi: <script>alert(1)</script>", "01.01 10:00")
    assert "<script>" not in message
    assert "&lt;script&gt;" in message


def test_audit_message_escapes_html_in_actor_name():
    actor = Mock(is_authenticated=True, get_role_display=lambda: "Administrator")
    actor.name = '<b onmouseover="x">Ivan</b>'
    message = _compose_message(actor, "some action", "01.01 10:00")
    assert '<b onmouseover' not in message
    assert "&lt;b onmouseover" in message


def test_announcement_message_escapes_html_in_text_and_author():
    message = _compose_announcement_message("Ertaga < 5 daqiqa kechikmang", "O'qituvchi & Boshliq")
    assert "< 5" not in message
    assert "&lt; 5" in message
    assert "&amp;" in message


def test_announcement_message_without_author_still_escapes():
    message = _compose_announcement_message("<i>test</i>", None)
    assert "<i>test</i>" not in message
    assert "&lt;i&gt;test&lt;/i&gt;" in message
