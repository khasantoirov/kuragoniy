"""Signing in with the full name: any case, apostrophe style and word
order; every existing login (email, student login, previous login) keeps
working exactly as before; two people with one name are told apart by
the password; the password reset takes the name too when it is one
account's."""

import pytest
from django.core.cache import cache

from accounts.models import PasswordResetCode, User, name_key

pytestmark = pytest.mark.django_db

URL = '/api/auth/login/'
PW = 'Kuchli-Parol-2026'


@pytest.fixture(autouse=True)
def _no_throttle_carryover():
    cache.clear()


def login(client, who, pw=PW):
    return client.post(URL, {'login': who, 'password': pw}, format='json')


def teacher_named(name, email, pw=PW):
    return User.objects.create_user(email=email, password=pw, name=name, role=User.Role.TEACHER, approved=True)


def student_named(name, username, pw=PW):
    return User.objects.create_user(None, password=pw, username=username, name=name, role=User.Role.STUDENT, approved=True)


def test_name_key_ignores_case_spacing_apostrophes_and_order():
    assert name_key('Aliyev  Vali') == name_key('vali ALIYEV') == 'aliyev vali'
    assert name_key('Gʻofurov O‘tkir') == name_key("g'ofurov o'tkir")
    assert name_key('   ') == ''


def test_full_name_signs_in(api_client):
    teacher_named("G'ofurov O'tkir", 'otkir@example.com')
    for typed in ("G'ofurov O'tkir", "o'tkir g'ofurov", 'GʻOFUROV  OʼTKIR'):
        r = login(api_client, typed)
        assert r.status_code == 200, (typed, r.data)
        assert r.data['user']['name'] == "G'ofurov O'tkir"


def test_existing_logins_keep_working(api_client):
    t = teacher_named('Karimova Nodira', 'nodira@example.com')
    s = student_named('Toshmatov Sardor', 'sardor7a')
    s.previous_username = 'old.sardor'
    s.save(update_fields=['previous_username'])
    assert login(api_client, 'NODIRA@example.com').status_code == 200
    assert login(api_client, 'sardor7a').status_code == 200
    r = login(api_client, 'old.sardor')
    assert r.status_code == 200 and r.data['renamed_login'] == 'sardor7a'
    assert login(api_client, 'Toshmatov Sardor').status_code == 200
    assert t.email == 'nodira@example.com'


def test_wrong_password_by_name_counts_against_the_account(api_client):
    t = teacher_named('Rahimov Bekzod', 'bekzod@example.com')
    assert login(api_client, 'Rahimov Bekzod', 'noto-gri').status_code == 401
    t.refresh_from_db()
    assert t.failed_login_count == 1


def test_one_name_two_accounts_the_password_decides(api_client):
    a = student_named('Aliyev Vali', 'vali7a', pw='Parol-Birinchi-1')
    b = student_named('Aliyev Vali', 'vali8b', pw='Parol-Ikkinchi-2')
    r = login(api_client, 'Aliyev Vali', 'Parol-Ikkinchi-2')
    assert r.status_code == 200 and r.data['user']['id'] == b.id
    r = login(api_client, 'vali aliyev', 'Parol-Birinchi-1')
    assert r.status_code == 200 and r.data['user']['id'] == a.id

    assert login(api_client, 'Aliyev Vali', 'hech-biri').status_code == 401
    a.refresh_from_db()
    b.refresh_from_db()
    assert (a.failed_login_count, b.failed_login_count) == (1, 1)


def test_one_name_one_password_asks_for_the_login(api_client):
    student_named('Yusupova Madina', 'madina1')
    student_named('Yusupova Madina', 'madina2')
    r = login(api_client, 'Yusupova Madina')
    assert r.status_code == 400 and 'Loginingiz' in r.data['detail']
    assert login(api_client, 'madina2').status_code == 200


def test_a_blocked_namesake_does_not_get_in_the_way(api_client):
    gone = teacher_named('Nazarov Ulugbek', 'gone@example.com')
    gone.is_active = False
    gone.save(update_fields=['is_active'])
    teacher_named('Nazarov Ulugbek', 'here@example.com')
    r = login(api_client, 'Nazarov Ulugbek')
    assert r.status_code == 200 and r.data['user']['email'] == 'here@example.com'


def test_an_existing_login_wins_over_a_name(api_client):
    """A one-word name equal to someone's student login: the login keeps
    meaning what it meant."""
    s = student_named('Ergashev Farrux', 'muhammad', pw='Talaba-Paroli-1')
    teacher_named('Muhammad', 'muhammad@example.com')
    r = login(api_client, 'muhammad', 'Talaba-Paroli-1')
    assert r.status_code == 200 and r.data['user']['id'] == s.id


def test_renaming_moves_the_name_login(api_client):
    t = teacher_named('Eski Ism', 'rename@example.com')
    t.name = 'Yangi Familiya'
    t.save(update_fields=['name'])
    assert login(api_client, 'Eski Ism').status_code == 401
    assert login(api_client, 'Familiya Yangi').status_code == 200


def test_password_reset_takes_a_unique_name(api_client):
    t = teacher_named('Abdullayev Madina', 'reset@example.com')
    t.telegram_linked, t.telegram_chat_id = True, 12345
    t.save(update_fields=['telegram_linked', 'telegram_chat_id'])
    r = api_client.post('/api/auth/password-reset/request/', {'login': 'madina abdullayev'}, format='json')
    assert r.status_code == 200
    assert PasswordResetCode.objects.filter(user=t).count() == 1


def test_password_reset_ignores_a_shared_name(api_client):
    for i in (1, 2):
        s = student_named('Qodirov Jasur', f'jasur{i}')
        s.telegram_linked, s.telegram_chat_id = True, 990 + i
        s.save(update_fields=['telegram_linked', 'telegram_chat_id'])
    r = api_client.post('/api/auth/password-reset/request/', {'login': 'Qodirov Jasur'}, format='json')
    assert r.status_code == 200
    assert not PasswordResetCode.objects.exists()
