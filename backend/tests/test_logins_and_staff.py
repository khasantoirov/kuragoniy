"""Generated student logins (first name + surname, no dots), regenerating
the existing ones, "remember me", staff accounts made by an administrator,
handing a class to another teacher and a teacher's own statistics."""

import pytest
from django.core.management import call_command

from accounts.models import User
from journal.models import JournalClass
from learning.student_accounts import create_student_account, unique_username, username_base

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("full_name, expected", [
    ("Aliyev Vali", "valialiyev"),
    ("Vali Aliyev", "valialiyev"),
    ("Abdurahmonova Mohinur Karimovna", "mohinurabdurahmonova"),
    ("To'xtayev G'ayrat Akmal o'g'li", "gayrattoxtayev"),
    ("Алиев Вали", "valialiev"),
    ("Madina", "madina"),
    ("Abdurashidxo'jayev Muhammadabdulloh", "muhammadabdullohabdurashidxojayev"),
])
def test_username_is_first_name_then_surname_without_dots(full_name, expected):
    assert username_base(full_name) == expected


def test_namesakes_get_a_number(journal_class):
    first, _ = create_student_account(full_name="Aliyev Vali", journal_class=journal_class, password="Talaba-2026x")
    second, _ = create_student_account(full_name="Aliyev Vali", journal_class=journal_class, password="Talaba-2026x")
    third, _ = create_student_account(full_name="Vali Aliyev", journal_class=journal_class, password="Talaba-2026x")
    assert [first.username, second.username, third.username] == ["valialiyev", "valialiyev2", "valialiyev3"]


def test_rename_command_keeps_passwords_and_old_login(api_client, journal_class):
    old_a, _ = create_student_account(full_name="Aliyev Vali", journal_class=journal_class,
                                      username="aliyev.vali", password="Talaba-2026x")
    old_b, _ = create_student_account(full_name="Karimova Nodira", journal_class=journal_class,
                                      username="karimova.nodira", password="Talaba-2026y")

    call_command("rename_student_logins")  # dry run changes nothing
    assert User.objects.get(pk=old_a.pk).username == "aliyev.vali"

    call_command("rename_student_logins", "--apply")
    a, b = User.objects.get(pk=old_a.pk), User.objects.get(pk=old_b.pk)
    assert (a.username, a.previous_username) == ("valialiyev", "aliyev.vali")
    assert b.username == "nodirakarimova"
    assert a.check_password("Talaba-2026x") and b.check_password("Talaba-2026y")

    # New login works; the old one still does and says what the new one is.
    ok = api_client.post("/api/auth/login/", {"login": "valialiyev", "password": "Talaba-2026x"}, format="json")
    assert ok.status_code == 200 and "renamed_login" not in ok.data
    old = api_client.post("/api/auth/login/", {"login": "aliyev.vali", "password": "Talaba-2026x"}, format="json")
    assert old.status_code == 200 and old.data["renamed_login"] == "valialiyev"

    # Running again is a no-op, and nobody new can take an old login.
    call_command("rename_student_logins", "--apply")
    assert User.objects.get(pk=old_a.pk).username == "valialiyev"
    assert unique_username("Vali Aliyev") == "valialiyev2"


def _cookie(resp):
    return resp.cookies["refresh_token"] if "refresh_token" in resp.cookies else next(iter(resp.cookies.values()))


def test_remember_me_controls_cookie_lifetime(api_client, make_user):
    make_user("rm@example.com", approved=True)
    kept = api_client.post("/api/auth/login/", {"login": "rm@example.com", "password": "testpass123", "remember": True},
                           format="json")
    assert _cookie(kept)["max-age"]

    session = api_client.post("/api/auth/login/", {"login": "rm@example.com", "password": "testpass123", "remember": False},
                              format="json")
    assert session.status_code == 200 and not _cookie(session)["max-age"]

    # A refreshed cookie stays a session cookie.
    refreshed = api_client.post("/api/auth/refresh/")
    assert refreshed.status_code == 200
    if refreshed.cookies:
        assert not _cookie(refreshed)["max-age"]


def test_admin_creates_teacher_with_one_time_password(as_user, api_client, admin, teacher):
    resp = as_user(admin).post("/api/accounts/users/create-staff/", {"name": "Toirov Hasan"}, format="json")
    assert resp.status_code == 201, resp.data
    assert resp.data["login"] == "hasantoirov"
    user = User.objects.get(pk=resp.data["id"])
    assert user.role == "teacher" and user.approved and user.must_change_password

    api_client.force_authenticate(user=None)
    login = api_client.post("/api/auth/login/", {"login": "hasantoirov", "password": resp.data["password"]}, format="json")
    assert login.status_code == 200 and login.data["user"]["must_change_password"]

    assert as_user(teacher).post("/api/accounts/users/create-staff/", {"name": "Boshqa Odam"},
                                 format="json").status_code == 403


def test_admin_hands_class_to_another_teacher(as_user, admin, teacher, make_user, journal_class, student):
    other = make_user("other@example.com", approved=True)
    resp = as_user(admin).post(f"/api/schools/classes/{journal_class.id}/teacher/", {"teacher": other.id}, format="json")
    assert resp.status_code == 200
    assert JournalClass.objects.get(pk=journal_class.pk).teacher == other

    mine = [c["id"] for c in as_user(other).get("/api/learning/classes/").data["results"]]
    assert journal_class.id in mine
    assert as_user(teacher).post(f"/api/learning/classes/{journal_class.id}/create-accounts/", {},
                                 format="json").status_code in (403, 404)
    assert as_user(teacher).post(f"/api/schools/classes/{journal_class.id}/teacher/", {"teacher": teacher.id},
                                 format="json").status_code == 403


def test_teacher_statistics_cover_only_own_classes(as_user, teacher, make_user, journal_class):
    other = make_user("other@example.com", approved=True)
    JournalClass.objects.create(teacher=other, name="9-B", school="1-maktab")
    data = as_user(teacher).get("/api/schools/stats/mine/").data
    assert [c["name"] for c in data["classes"]] == ["8-A"]
    assert data["totals"]["students"] == 3
