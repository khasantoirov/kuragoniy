"""admin.kuragoniy.uz: only an Admin or the developer signs in there
(common/adminhost.py). Everyone else is refused at the panel's address
and still signs in on kuragoniy.uz as before."""

import pyotp
import pytest

from accounts.models import User

ADMIN_HOST = 'admin.kuragoniy.uz'


@pytest.fixture(autouse=True)
def panel_host(settings):
    settings.ADMIN_HOSTS = [ADMIN_HOST]
    settings.ALLOWED_HOSTS = ['testserver', ADMIN_HOST]


def sign_in(client, user, host=None):
    extra = {'HTTP_HOST': host} if host else {}
    return client.post('/api/auth/login/', {'login': user.username, 'password': 'testpass123'}, format='json', **extra)


@pytest.mark.django_db
@pytest.mark.parametrize('role', [User.Role.TEACHER, User.Role.BOSHLIQ, User.Role.KUZATUVCHI, User.Role.MAKTAB])
def test_the_panel_refuses_everyone_but_an_admin(api_client, make_user, role):
    person = make_user(f'{role}@example.com', role=role, approved=True)
    refused = sign_in(api_client, person, ADMIN_HOST)
    assert refused.status_code == 403
    assert refused.data['code'] == 'not_admin'
    assert 'refresh_token' not in refused.cookies
    # the same person still signs in on kuragoniy.uz
    assert sign_in(api_client, person).status_code == 200


@pytest.mark.django_db
def test_an_admin_and_the_developer_sign_in_at_the_panel(api_client, admin, dev_superuser):
    for person in (admin, dev_superuser):
        resp = sign_in(api_client, person, ADMIN_HOST)
        assert resp.status_code == 200, resp.data
        assert 'refresh_token' in resp.cookies


@pytest.mark.django_db
def test_a_refused_try_is_not_a_wrong_password(api_client, teacher):
    for _ in range(8):
        sign_in(api_client, teacher, ADMIN_HOST)
    teacher.refresh_from_db()
    assert teacher.locked_until is None
    assert sign_in(api_client, teacher).status_code == 200


@pytest.mark.django_db
def test_demoted_admin_is_out_of_the_panel_at_the_next_refresh(api_client, admin):
    login = sign_in(api_client, admin, ADMIN_HOST)
    api_client.cookies['refresh_token'] = login.cookies['refresh_token'].value
    assert api_client.post('/api/auth/refresh/', HTTP_HOST=ADMIN_HOST).status_code == 200

    User.objects.filter(pk=admin.pk).update(role=User.Role.TEACHER)
    api_client.cookies['refresh_token'] = login.cookies['refresh_token'].value
    resp = api_client.post('/api/auth/refresh/', HTTP_HOST=ADMIN_HOST)
    assert resp.status_code == 401
    assert resp.data['code'] == 'not_admin'


@pytest.mark.django_db
def test_a_two_step_challenge_from_the_site_does_not_open_the_panel(api_client, teacher):
    teacher.totp_secret = pyotp.random_base32()
    teacher.totp_enabled = True
    teacher.save(update_fields=['totp_secret', 'totp_enabled'])
    first = sign_in(api_client, teacher)  # kuragoniy.uz
    assert first.data['totp_required']
    code = pyotp.TOTP(teacher.totp_secret).now()
    resp = api_client.post('/api/auth/2fa/verify/', {'challenge': first.data['challenge'], 'code': code},
                           format='json', HTTP_HOST=ADMIN_HOST)
    assert resp.status_code == 403
    assert resp.data['code'] == 'not_admin'
