"""First name and surname apart; birth date and phone required in one's own
profile; the developer may correct anyone's details and login."""

from datetime import date, timedelta

import pytest
from rest_framework.exceptions import ValidationError

from accounts.models import User
from accounts.profile import clean_first_name, clean_last_name, clean_phone, split_full_name

pytestmark = pytest.mark.django_db

ME = "/api/accounts/me/"
GOOD = {"first_name": "hasan", "last_name": "toirov", "bday": "1990-05-17", "phone": "90 123 45 67"}


@pytest.mark.parametrize("raw, expected", [
    ("Hasan", "Hasan"), ("  hasan ", "Hasan"), ("O'tkir", "O'tkir"), ("G'ulom", "G'ulom"),
    ("Анна-Мария", "Анна-Мария"),
])
def test_first_name_is_one_word(raw, expected):
    assert clean_first_name(raw) == expected


@pytest.mark.parametrize("bad", ["", "  ", "Hasan Toirov", "H", "Hasan2", "-Hasan", "Ali_"])
def test_first_name_refuses(bad):
    with pytest.raises(ValidationError):
        clean_first_name(bad)


def test_surname_optional_up_to_two_words():
    assert clean_last_name("") == ""
    assert clean_last_name("toirov") == "Toirov"
    assert clean_last_name("abdulla o'g'li") == "Abdulla O'g'li"
    with pytest.raises(ValidationError):
        clean_last_name("bir ikki uch")


@pytest.mark.parametrize("raw, expected", [
    ("90 123 45 67", "+998901234567"), ("+998 (90) 123-45-67", "+998901234567"),
    ("998901234567", "+998901234567"), ("+7 912 345 67 89", "+79123456789"),
])
def test_phone_normalised(raw, expected):
    assert clean_phone(raw) == expected


@pytest.mark.parametrize("bad", ["", "12345", "+998 90 123 45", "+998 90 123 45 678"])
def test_phone_refuses(bad):
    with pytest.raises(ValidationError):
        clean_phone(bad)


@pytest.mark.parametrize("name, expected", [
    ("Toirov Hasan", ("Hasan", "Toirov")), ("Vali Aliyev", ("Vali", "Aliyev")),
    ("Karimova Nodira Akmal qizi", ("Nodira", "Karimova")), ("Madina", ("Madina", "")), ("", ("", "")),
])
def test_old_name_split_guess(name, expected):
    assert split_full_name(name) == expected


def test_profile_save_builds_name(as_user, teacher):
    resp = as_user(teacher).patch(ME, GOOD, format="json")
    assert resp.status_code == 200, resp.data
    assert (resp.data["first_name"], resp.data["last_name"], resp.data["name"]) == ("Hasan", "Toirov", "Hasan Toirov")
    assert resp.data["phone"] == "+998901234567" and resp.data["profile_complete"]
    assert resp.data["name_guess"] is None
    teacher.refresh_from_db()
    assert teacher.name == "Hasan Toirov" and teacher.bday == date(1990, 5, 17)

    # Surname may go; the name follows.
    resp = as_user(teacher).patch(ME, {**GOOD, "last_name": ""}, format="json")
    assert resp.status_code == 200 and resp.data["name"] == "Hasan"


def test_profile_refuses_full_name_in_first_name(as_user, teacher):
    resp = as_user(teacher).patch(ME, {**GOOD, "first_name": "Hasan Toirov"}, format="json")
    assert resp.status_code == 400 and "first_name" in resp.data


@pytest.mark.parametrize("missing", ["first_name", "bday", "phone"])
def test_profile_requires_first_name_bday_phone(as_user, teacher, missing):
    resp = as_user(teacher).patch(ME, {**GOOD, missing: ""}, format="json")
    assert resp.status_code == 400 and missing in resp.data
    resp = as_user(teacher).patch(ME, {k: v for k, v in GOOD.items() if k != missing}, format="json")
    assert resp.status_code == 400 and missing in resp.data  # nothing stored to fall back on


def test_profile_refuses_future_birth_date(as_user, teacher):
    tomorrow = (date.today() + timedelta(days=2)).isoformat()
    assert as_user(teacher).patch(ME, {**GOOD, "bday": tomorrow}, format="json").status_code == 400


def test_name_is_read_only_now(as_user, teacher):
    as_user(teacher).patch(ME, {**GOOD, "name": "Boshqa Odam"}, format="json")
    teacher.refresh_from_db()
    assert teacher.name == "Hasan Toirov"


def test_photo_only_patch_needs_no_details(as_user, teacher):
    """An old account without the split can still change other things."""
    resp = as_user(teacher).patch(ME, {"photo": None}, format="json")
    assert resp.status_code == 200
    assert resp.data["name_guess"] == ["teacher", ""] and not resp.data["profile_complete"]


def test_developer_edits_anyones_details_and_login(as_user, api_client, dev_superuser, teacher, make_user):
    url = f"/api/accounts/users/{teacher.pk}/edit-profile/"
    resp = as_user(dev_superuser).post(url, {
        "first_name": "aziz", "last_name": "karimov", "phone": "+998 91 000 00 01",
        "bday": "1985-01-02", "login": "Aziz.Ustoz",
    }, format="json")
    assert resp.status_code == 200, resp.data
    teacher.refresh_from_db()
    assert (teacher.name, teacher.phone, teacher.bday, teacher.username) == (
        "Aziz Karimov", "+998910000001", date(1985, 1, 2), "aziz.ustoz")

    api_client.force_authenticate(user=None)
    assert api_client.post("/api/auth/login/", {"login": "aziz.ustoz", "password": "testpass123"},
                           format="json").status_code == 200

    # The developer may clear a phone / birth date; the first name stays required.
    resp = as_user(dev_superuser).post(url, {"phone": "", "bday": ""}, format="json")
    assert resp.status_code == 200
    teacher.refresh_from_db()
    assert teacher.phone == "" and teacher.bday is None
    assert as_user(dev_superuser).post(url, {"first_name": "Aziz Karimov"}, format="json").status_code == 400
    assert as_user(dev_superuser).post(url, {"bday": "kecha"}, format="json").status_code == 400

    other = make_user("other@example.com", approved=True)
    other.username = "band"
    other.save(update_fields=["username"])
    assert as_user(dev_superuser).post(url, {"login": "BAND"}, format="json").status_code == 400
    assert as_user(dev_superuser).post(url, {"login": "1abc"}, format="json").status_code == 400


def test_only_the_developer_edits_details(as_user, admin, teacher):
    url = f"/api/accounts/users/{teacher.pk}/edit-profile/"
    assert as_user(admin).post(url, {"first_name": "Aziz"}, format="json").status_code == 403
    assert as_user(teacher).post(url, {"first_name": "Aziz"}, format="json").status_code == 403


def test_create_staff_takes_first_and_last_name(as_user, admin):
    url = "/api/accounts/users/create-staff/"
    resp = as_user(admin).post(url, {"first_name": "nodira", "last_name": "karimova", "phone": "93 111 22 33"},
                               format="json")
    assert resp.status_code == 201, resp.data
    user = User.objects.get(pk=resp.data["id"])
    assert (user.first_name, user.last_name, user.name, user.phone) == ("Nodira", "Karimova", "Nodira Karimova",
                                                                         "+998931112233")
    assert resp.data["login"] == "nodirakarimova"

    resp = as_user(admin).post(url, {"first_name": "Nodira Karimova"}, format="json")
    assert resp.status_code == 400 and "first_name" in resp.data
    resp = as_user(admin).post(url, {"first_name": "Bobur"}, format="json")  # no surname is fine
    assert resp.status_code == 201 and resp.data["name"] == "Bobur"
