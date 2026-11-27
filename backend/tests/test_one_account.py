"""One account for both addresses — owner, 2026-11-27: "alohida
admin.kuragoniy uchun login parol qilmaylik ... bitta login parol". An
Admin's or the developer's account signs in at admin.kuragoniy.uz to run
the platform and at kuragoniy.uz to teach, with the same login and
password; there are no separate admin accounts."""

import pytest

ADMIN_HOST = 'admin.kuragoniy.uz'

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def panel_host(settings):
    settings.ADMIN_HOSTS = [ADMIN_HOST]
    settings.ALLOWED_HOSTS = ['testserver', ADMIN_HOST]


def sign_in(client, user, host=None):
    extra = {'HTTP_HOST': host} if host else {}
    return client.post('/api/auth/login/', {'login': user.username, 'password': 'testpass123'}, format='json', **extra)


def test_the_same_login_opens_both_addresses(api_client, admin, dev_superuser):
    for person in (admin, dev_superuser):
        assert sign_in(api_client, person).status_code == 200            # kuragoniy.uz
        assert sign_in(api_client, person, ADMIN_HOST).status_code == 200  # the panel


def test_no_separate_admin_accounts(as_user, dev_superuser):
    resp = as_user(dev_superuser).post('/api/accounts/users/create-admin-account/', {}, format='json',
                                       HTTP_HOST=ADMIN_HOST)
    assert resp.status_code in (404, 405)
    assert 'is_panel_account' not in as_user(dev_superuser).get('/api/accounts/me/').data
