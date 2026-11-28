"""2026-11-28 bot additions: «Ochish» under every Telegram notification (the
page in the mini app), «📅 Bugungi darslarim», and «📖 Ilovada o'qish» for a
book too big for the bot to send."""

from datetime import date, datetime, time
from unittest.mock import patch

import pytest
from django.test import override_settings
from django.utils import timezone

from common.audit import app_link, open_button, send_telegram_message
from notifications.models import Kind
from notifications.service import notify
from staffroom import reminders
from telegrambot.bot import library, today
from timetable.models import TimetableSlot

WED = date(2026, 11, 18)


def at(day, h, m=0):
    return timezone.make_aware(datetime.combine(day, time(h, m)))


@override_settings(SITE_URL='https://kuragoniy.uz')
def test_app_link_only_for_own_paths():
    assert app_link('/reports?id=3') == 'https://kuragoniy.uz/tg?to=%2Freports%3Fid%3D3'
    for bad in ('', 'reports', '//evil.example/x', 'https://evil.example/', '/\\evil'):
        assert app_link(bad) is None
    button = open_button('/timetable')['inline_keyboard'][0][0]
    assert button['text'] == '🚀 Ochish' and button['web_app']['url'].endswith('/tg?to=%2Ftimetable')


@override_settings(SITE_URL='http://localhost:8000')
def test_no_button_without_https():
    assert app_link('/timetable') is None and open_button('/timetable') is None


class Resp:
    def __init__(self, code):
        self.status_code = code


@override_settings(SITE_URL='https://kuragoniy.uz')
def test_message_carries_the_button_and_falls_back(monkeypatch):
    monkeypatch.setenv('BOT_TOKEN', '1:x')
    with patch('common.audit.requests.post', return_value=Resp(200)) as post:
        send_telegram_message(5, 'Salom', background=False, open_path='/timetable')
    (_, kw), = post.call_args_list
    assert kw['json']['reply_markup']['inline_keyboard'][0][0]['web_app']['url'].endswith('%2Ftimetable')

    # Telegram refuses the button: the text still goes, plain
    with patch('common.audit.requests.post', side_effect=[Resp(400), Resp(200)]) as post:
        send_telegram_message(5, 'Salom', background=False, open_path='/timetable')
    assert len(post.call_args_list) == 2 and 'reply_markup' not in post.call_args_list[1][1]['json']

    with patch('common.audit.requests.post', return_value=Resp(200)) as post:
        send_telegram_message(5, 'Kod: 1234', background=False)
    assert 'reply_markup' not in post.call_args_list[0][1]['json']


@pytest.mark.django_db
def test_notify_passes_the_page(teacher):
    teacher.telegram_linked, teacher.telegram_chat_id = True, 777
    teacher.save()
    with patch('notifications.service.notify_user') as tg:
        notify(teacher, Kind.ELON, "E'lon", 'Matn', url='/announcements')
    assert tg.call_args.kwargs['url'] == '/announcements'


@pytest.fixture
def week(teacher, monkeypatch):
    monkeypatch.setattr(reminders, 'place', lambda day: {'chorak': 2, 'week': 3, 'exact': True})
    TimetableSlot.objects.create(teacher=teacher, day_index=2, period_index=2, time_from=time(9), time_to=time(9, 45),
                                 maktab='Iftixor School', sinf='7-A', xona='12')
    TimetableSlot.objects.create(teacher=teacher, day_index=2, period_index=1, maktab='Iftixor School', sinf='8-B')
    TimetableSlot.objects.create(teacher=teacher, day_index=2, period_index=4, maktab='Universitet', band=True)
    return teacher


@pytest.mark.django_db
def test_todays_lessons_any_time(week, monkeypatch):
    text = reminders.today_for(week, at(WED, 15))
    assert text.startswith('📅 Bugun (18.11.2026) 2 ta darsingiz bor:')
    lines = text.split('\n')[1:]
    assert lines[0].startswith('1-soat') and lines[1].startswith('2-soat · 09:00–09:45 — Iftixor School · 7-A (12-xona)')
    assert 'Universitet' not in text  # "band" isn't a lesson

    assert "jadvalingizda dars yo'q" in reminders.today_for(week, at(date(2026, 11, 19), 9))
    monkeypatch.setattr(reminders, 'place', lambda day: {'chorak': None, 'week': None, 'exact': True})
    assert 'dars kuni emas' in reminders.today_for(week, at(date(2026, 11, 19), 9))


@pytest.mark.django_db
def test_todays_lessons_only_for_teachers(student):
    assert "o'qituvchilar uchun" in reminders.today_for(student)


@pytest.mark.django_db
@override_settings(SITE_URL='https://kuragoniy.uz')
def test_todays_lessons_bot_answer(week):
    week.telegram_linked, week.telegram_chat_id = True, 4242
    week.save()
    text, link = today._answer_sync(4242)
    assert text.startswith('📅 Bugun') and link.endswith('/tg?to=%2Ftimetable')  # today: whatever day the test runs
    assert today._answer_sync(1) == (None, None)


def test_keyboard_has_both_buttons():
    rows = library.main_menu_keyboard().keyboard
    assert [b.text for b in rows[0]] == ['📅 Bugungi darslarim', '📚 Kutubxona']


@pytest.mark.django_db
@override_settings(SITE_URL='https://kuragoniy.uz')
def test_library_item_has_reader_link(tmp_path, settings):
    from django.core.files.base import ContentFile

    from library.models import LibraryItem

    settings.MEDIA_ROOT = str(tmp_path)
    item = LibraryItem.objects.create(title='Fizika 9', kind='kitob', grade='9')
    item.file.save('f9.pdf', ContentFile(b'%PDF-1.4'), save=True)
    (path, label, reader), = library._files_sync()
    assert label.endswith('Fizika 9 (9-sinf)')
    assert reader == f'https://kuragoniy.uz/tg?to=%2Flibrary%2F{item.pk}%2Fread'
