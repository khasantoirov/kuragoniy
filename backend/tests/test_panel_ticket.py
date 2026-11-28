"""kuragoniy.uz → «Boshqaruv paneli» opens admin.kuragoniy.uz already
signed in (owner, 2026-11-28): a one-time ticket, good for a minute, for an
Admin or the developer only."""

import pytest
from django.core.cache import cache

from accounts.models import User

ADMIN_HOST = 'admin.kuragoniy.uz'
PANEL = {'HTTP_HOST': ADMIN_HOST}

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def panel_host(settings):
    settings.ADMIN_HOSTS = [ADMIN_HOST]
    settings.ALLOWED_HOSTS = ['testserver', ADMIN_HOST]
    cache.clear()


def ticket_for(client):
    resp = client.post('/api/auth/panel-ticket/')
    assert resp.status_code == 200, resp.data
    return resp.data['ticket']


def test_a_ticket_opens_the_panel_once(as_user, api_client, admin, dev_superuser):
    for person in (admin, dev_superuser):
        ticket = ticket_for(as_user(person))
        resp = api_client.post('/api/auth/panel-ticket/redeem/', {'ticket': ticket}, format='json', **PANEL)
        assert resp.status_code == 200, resp.data
        assert resp.data['user']['id'] == str(person.pk) and 'refresh_token' in resp.cookies
        again = api_client.post('/api/auth/panel-ticket/redeem/', {'ticket': ticket}, format='json', **PANEL)
        assert again.status_code == 401 and again.data['code'] == 'used'


def test_teachers_get_no_ticket(as_user, teacher):
    assert as_user(teacher).post('/api/auth/panel-ticket/').status_code == 403


def test_forged_or_late_or_off_panel_tickets_open_nothing(as_user, api_client, admin, settings, monkeypatch):
    bad = api_client.post('/api/auth/panel-ticket/redeem/', {'ticket': 'x:y:z'}, format='json', **PANEL)
    assert bad.status_code == 401
    ticket = ticket_for(as_user(admin))
    # only at the panel's address
    assert api_client.post('/api/auth/panel-ticket/redeem/', {'ticket': ticket}, format='json').status_code == 400
    # a minute later it is gone
    import accounts.views as v
    monkeypatch.setattr(v, 'PANEL_TICKET_MAX_AGE', -1)
    late = api_client.post('/api/auth/panel-ticket/redeem/', {'ticket': ticket}, format='json', **PANEL)
    assert late.status_code == 401 and late.data['code'] == 'expired'


def test_someone_demoted_meanwhile_is_refused(as_user, api_client, admin):
    ticket = ticket_for(as_user(admin))
    User.objects.filter(pk=admin.pk).update(role=User.Role.TEACHER)
    resp = api_client.post('/api/auth/panel-ticket/redeem/', {'ticket': ticket}, format='json', **PANEL)
    assert resp.status_code == 403 and resp.data['code'] == 'not_admin'
