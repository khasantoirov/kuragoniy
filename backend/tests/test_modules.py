"""Boshqaruv → Modullar: administrators switch optional sections off; the
state reaches everyone signed in (pupils too), the usage only
administrators; the change goes to the security log."""

import pytest

from common.models import AuditLog
from common.modules import MODULES

pytestmark = pytest.mark.django_db

URL = '/api/common/modules/'


def test_everything_is_on_by_default(as_user, teacher):
    r = as_user(teacher).get(URL)
    assert r.status_code == 200
    assert r.data['modules'] == {k: True for k in MODULES}
    assert 'usage' not in r.data


def test_admin_switches_a_section_off_and_on(as_user, admin, teacher):
    c = as_user(admin)
    r = c.patch(URL, {'modules': {'shop': False, 'games': False}}, format='json')
    assert r.status_code == 200
    assert r.data['modules']['shop'] is False and r.data['modules']['games'] is False
    assert r.data['modules']['library'] is True
    assert set(r.data['usage']) == set(MODULES)
    assert as_user(teacher).get(URL).data['modules']['shop'] is False

    log = AuditLog.objects.get(action='modules_changed')
    assert 'shop' in log.detail and 'games' in log.detail

    r = as_user(admin).patch(URL, {'modules': {'shop': True}}, format='json')
    assert r.data['modules']['shop'] is True and r.data['modules']['games'] is False


def test_only_admins_change_it(as_user, teacher):
    assert as_user(teacher).patch(URL, {'modules': {'shop': False}}, format='json').status_code == 403


def test_unknown_or_bad_values_are_refused(as_user, admin):
    c = as_user(admin)
    assert c.patch(URL, {'modules': {'nope': False}}, format='json').status_code == 400
    assert c.patch(URL, {'modules': {'shop': 'no'}}, format='json').status_code == 400
    assert c.patch(URL, {'modules': ['shop']}, format='json').status_code == 400


def test_pupils_read_it(as_user, admin, student):
    as_user(admin).patch(URL, {'modules': {'assignments': False}}, format='json')
    r = as_user(student).get(URL)
    assert r.status_code == 200 and r.data['modules']['assignments'] is False
    assert as_user(student).patch(URL, {'modules': {'assignments': True}}, format='json').status_code == 403


def test_usage_counts_what_is_stored(as_user, admin):
    from library.models import LibraryItem
    before = as_user(admin).get(URL).data['usage']['library']
    LibraryItem.objects.create(title='Fizika 7', kind=LibraryItem.Kind.choices[0][0], url='https://example.com/f7.pdf')
    assert as_user(admin).get(URL).data['usage']['library'] == before + 1
