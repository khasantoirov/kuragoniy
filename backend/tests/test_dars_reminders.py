"""Dars eslatmalari (staffroom/reminders.py): the morning list of the day's
lessons and the evening nudge about journal days not written yet."""
from datetime import date, datetime, time

import pytest
from django.core.cache import cache
from django.utils import timezone

from journal.models import ClassDay, JournalClass
from notifications.models import NotificationPreference
from staffroom import reminders
from timetable.models import TimetableSlot

pytestmark = pytest.mark.django_db

WED = date(2026, 11, 18)  # a Wednesday (day_index 2)


def at(day, h, m=0):
    return timezone.make_aware(datetime.combine(day, time(h, m)))


class Sent(list):
    """(user id, text) per Telegram message; .urls — the «Ochish» pages."""
    urls: list


@pytest.fixture
def sent(monkeypatch):
    cache.clear()
    out = Sent()
    out.urls = []

    def fake(user, text, url=''):
        out.append((user.pk, text))
        out.urls.append(url)

    monkeypatch.setattr('notifications.service.notify_user', fake)
    monkeypatch.setattr(reminders, 'place', lambda day: {'chorak': 2, 'week': 3, 'exact': True})
    return out


@pytest.fixture
def lessons(teacher):
    teacher.telegram_linked, teacher.telegram_chat_id = True, 777
    teacher.save()
    TimetableSlot.objects.create(teacher=teacher, day_index=2, period_index=1, time_from=time(8), time_to=time(8, 45),
                                 maktab='Iftixor School', sinf='7-A', xona='12')
    TimetableSlot.objects.create(teacher=teacher, day_index=2, period_index=3, maktab='Universitet', band=True)
    TimetableSlot.objects.create(teacher=teacher, day_index=3, period_index=1, maktab='Iftixor School', sinf='8-B')
    return teacher


def test_morning_lists_the_days_lessons_once(sent, lessons):
    assert reminders.send_morning(at(WED, 6, 30)) == 0  # too early
    assert reminders.send_morning(at(WED, 7, 30)) == 1
    (uid, text), = sent
    assert uid == lessons.pk
    assert text.startswith('☀️ Bugun 1 ta darsingiz bor:')
    assert '1-soat · 08:00–08:45 — Iftixor School · 7-A (12-xona)' in text
    assert 'Universitet' not in text  # a "band" hour isn't a lesson
    # one tap to the page: «Ochish» under it (the mini app), no link line
    assert 'https://' not in text and sent.urls == ['/timetable']
    assert reminders.send_morning(at(WED, 8, 0)) == 0  # once a day


def test_no_reminders_on_days_off(sent, lessons, monkeypatch):
    assert reminders.send_morning(at(date(2026, 11, 21), 7, 30)) == 0  # Saturday
    monkeypatch.setattr(reminders, 'place', lambda day: {'chorak': None, 'week': None, 'exact': True})
    assert reminders.send_morning(at(WED, 7, 30)) == 0  # holidays
    assert sent == []


def test_evening_nudges_about_unwritten_journal_days(sent, lessons):
    jc = JournalClass.objects.create(teacher=lessons, name='7-A', school='Iftixor School')
    assert reminders.send_evening(at(WED, 17, 0)) == 0  # not yet evening
    assert reminders.send_evening(at(WED, 18, 30)) == 1
    (_uid, text), = sent
    assert 'jurnalga yozilmagan' in text and '7-A' in text
    assert 'https://' not in text and sent.urls == [f'/journal?class={jc.id}']

    # a written day: nothing to say the next week
    sent.clear()
    cache.clear()
    ClassDay.objects.create(journal_class=jc, date=WED, chorak=2)
    assert reminders.send_evening(at(WED, 18, 30)) == 0
    assert sent == []


def test_a_teacher_can_turn_them_off(sent, lessons):
    NotificationPreference.objects.create(user=lessons, channels={'dars': {'telegram': False}})
    reminders.send_morning(at(WED, 7, 30))
    assert sent == []
