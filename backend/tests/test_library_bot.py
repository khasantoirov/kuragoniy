"""The bot's 📚 Kutubxona button sends every library item with an uploaded
file straight to the chat — see telegrambot/bot/library.py. Only the pure
DB-query half is tested here (_files_sync); the aiogram handler itself
just wraps it with message.answer()/answer_document() calls, same
reasoning as test_telegram_replies.py.
"""

import pytest
from django.core.files.base import ContentFile

from library.models import LibraryItem
from telegrambot.bot.library import _files_sync

pytestmark = pytest.mark.django_db


def _with_file(**kwargs):
    item = LibraryItem.objects.create(**{'kind': 'kitob', 'url': '', **kwargs})
    item.file.save('test.pdf', ContentFile(b'%PDF-1.4 fake'), save=True)
    return item


def test_items_without_a_file_are_excluded():
    LibraryItem.objects.create(title='Faqat havola', kind='havola', url='https://example.com')
    assert _files_sync() == []


def test_item_with_file_is_included_with_kind_icon_and_grade():
    _with_file(title='Fizika darsligi', kind='kitob', grade=8)
    files = _files_sync()
    assert len(files) == 1
    path, label = files[0]
    assert path.endswith('.pdf')
    assert '📕' in label and 'Fizika darsligi' in label and '8-sinf' in label


def test_item_without_grade_has_no_grade_suffix():
    _with_file(title="Qo'llanma", kind='qollanma', grade=None)
    _, label = _files_sync()[0]
    assert '📗' in label and 'sinf' not in label


def test_results_ordered_by_grade_then_title():
    _with_file(title='Zebra', kind='kitob', grade=7)
    _with_file(title='Alpha', kind='kitob', grade=7)
    _with_file(title='Beta', kind='kitob', grade=9)
    labels = [label for _, label in _files_sync()]
    assert [('Alpha' in l, 'Zebra' in l, 'Beta' in l) for l in labels] == [
        (True, False, False),
        (False, True, False),
        (False, False, True),
    ]


def test_title_html_is_escaped():
    _with_file(title='<b>Evil</b> & Co', kind='kitob')
    _, label = _files_sync()[0]
    assert '<b>Evil</b>' not in label
    assert '&lt;b&gt;Evil&lt;/b&gt;' in label
    assert '&amp; Co' in label
