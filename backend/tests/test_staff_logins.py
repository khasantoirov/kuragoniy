"""Logins for staff who sign in with an email: made from the name by a
command, chosen by an administrator later — the password and the email
keep working the whole time."""

import pytest
from django.core.management import call_command

from accounts.models import User

pytestmark = pytest.mark.django_db


def _login(client, login, password="testpass123"):
    client.force_authenticate(user=None)
    return client.post("/api/auth/login/", {"login": login, "password": password}, format="json")


def test_command_adds_logins_and_keeps_email_sign_in(api_client, make_user, student):
    hasan = make_user("hasan.toirov@gmail.com", approved=True)
    hasan.name = "Toirov Hasan"
    hasan.save(update_fields=["name"])
    boss = make_user("boss@example.com", role=User.Role.BOSHLIQ, approved=True)
    boss.name = "Karimova Nodira"
    boss.save(update_fields=["name"])
    password_hashes = {u.pk: u.password for u in User.objects.all()}
    student_login = User.objects.get(pk=student.pk).username

    call_command("create_staff_logins")  # dry run changes nothing
    assert User.objects.get(pk=hasan.pk).username is None

    call_command("create_staff_logins", "--apply")
    hasan, boss = User.objects.get(pk=hasan.pk), User.objects.get(pk=boss.pk)
    assert (hasan.username, boss.username) == ("hasantoirov", "nodirakarimova")
    assert User.objects.get(pk=student.pk).username == student_login  # pupils untouched
    assert {u.pk: u.password for u in User.objects.all()} == password_hashes

    # The same password signs in with the new login and still with the email.
    assert _login(api_client, "hasantoirov").status_code == 200
    assert _login(api_client, "hasan.toirov@gmail.com").status_code == 200

    # Running again is a no-op.
    call_command("create_staff_logins", "--apply")
    assert User.objects.get(pk=hasan.pk).username == "hasantoirov"


def test_admin_changes_a_staff_login(as_user, api_client, admin, teacher, make_user):
    call_command("create_staff_logins", "--apply")
    old = User.objects.get(pk=teacher.pk).username
    other = make_user("other@example.com", approved=True)
    other.username = "band"
    other.save(update_fields=["username"])
    url = f"/api/accounts/users/{teacher.pk}/set-login/"

    for bad in ("ab", "1abc", "ali@x", "bo'sh joy"):
        assert as_user(admin).post(url, {"login": bad}, format="json").status_code == 400
    assert as_user(admin).post(url, {"login": "BAND"}, format="json").status_code == 400  # taken, any case

    resp = as_user(admin).post(url, {"login": "Aziz.Ustoz"}, format="json")
    assert resp.status_code == 200 and resp.data["username"] == "aziz.ustoz"

    # New login works; the old one still does and names the new one.
    assert _login(api_client, "aziz.ustoz").status_code == 200
    renamed = _login(api_client, old)
    assert renamed.status_code == 200 and renamed.data["renamed_login"] == "aziz.ustoz"
    assert _login(api_client, "teacher@example.com").status_code == 200

    # A teacher can't do it, nor a plain admin to another admin.
    assert as_user(teacher).post(url, {"login": "boshqa"}, format="json").status_code == 403
    other_admin = make_user("admin2@example.com", role=User.Role.ADMIN, approved=True)
    assert as_user(admin).post(f"/api/accounts/users/{other_admin.pk}/set-login/", {"login": "boshqa"},
                               format="json").status_code == 403


def test_pupil_login_is_not_changed_here(as_user, admin, student):
    resp = as_user(admin).post(f"/api/accounts/users/{student.pk}/set-login/", {"login": "yangilogin"}, format="json")
    assert resp.status_code in (403, 404)


def test_admin_changes_own_login(as_user, api_client, admin):
    resp = as_user(admin).post(f"/api/accounts/users/{admin.pk}/set-login/", {"login": "bosh.admin"}, format="json")
    assert resp.status_code == 200 and resp.data["username"] == "bosh.admin"
    assert _login(api_client, "bosh.admin").status_code == 200


def test_class_teacher_changes_a_pupil_login(as_user, api_client, teacher, make_user, journal_class, student):
    url = f"/api/learning/students/{student.pk}/set-login/"
    old = User.objects.get(pk=student.pk).username

    for bad in ("ab", "ali@x", "bo'sh joy"):
        assert as_user(teacher).post(url, {"username": bad}, format="json").status_code == 400
    taken = make_user("taken@example.com", approved=True)
    taken.username = "band"
    taken.save(update_fields=["username"])
    assert as_user(teacher).post(url, {"username": "Band"}, format="json").status_code == 400

    resp = as_user(teacher).post(url, {"username": "Vali.8A"}, format="json")
    assert resp.status_code == 200 and resp.data["username"] == "vali.8a"
    assert User.objects.get(pk=student.pk).check_password("Talaba-2026x")  # password untouched

    assert _login(api_client, "vali.8a", "Talaba-2026x").status_code == 200
    renamed = _login(api_client, old, "Talaba-2026x")
    assert renamed.status_code == 200 and renamed.data["renamed_login"] == "vali.8a"

    # Another class's teacher can't.
    other = make_user("other-teacher@example.com", approved=True)
    assert as_user(other).post(url, {"username": "boshqa1"}, format="json").status_code == 403
