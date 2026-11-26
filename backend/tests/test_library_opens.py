"""Kutubxona: a material's language and guide section, and the open
counter behind "Eng ko'p ochilganlar" (once per person a day)."""

import pytest
from django.core.cache import cache

from library.models import LibraryItem

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def fresh_cache():
    cache.clear()
    yield
    cache.clear()


def test_language_and_section_are_saved(as_user, admin):
    r = as_user(admin).post('/api/library/', {'title': "Platformada ishlash", 'url': 'https://example.com/v', 'kind': 'video',
                                               'lang': 'ru', 'section': 'platforma'}, format='json')
    assert r.status_code == 201, r.data
    assert (r.data['lang'], r.data['section'], r.data['opens']) == ('ru', 'platforma', 0)


def test_an_open_counts_once_a_day_per_person(as_user, teacher, make_user):
    item = LibraryItem.objects.create(title='Fizika 7', kind='havola', url='https://example.com')
    before = item.updated_at
    api = as_user(teacher)
    assert api.post(f'/api/library/{item.pk}/opened/').status_code == 200
    api.post(f'/api/library/{item.pk}/opened/')
    other = make_user('reader@example.com', approved=True)
    as_user(other).post(f'/api/library/{item.pk}/opened/')
    item.refresh_from_db()
    assert item.opens == 2
    assert item.updated_at == before  # counting doesn't make it "new"


def test_a_teacher_still_cannot_edit(as_user, teacher):
    item = LibraryItem.objects.create(title='Fizika 7', kind='havola', url='https://example.com')
    assert as_user(teacher).patch(f'/api/library/{item.pk}/', {'title': 'x'}, format='json').status_code == 403
