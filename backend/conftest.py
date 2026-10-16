import pytest
from rest_framework.test import APIClient

from accounts.models import User


@pytest.fixture(autouse=True)
def isolated_media_root(settings, tmp_path):
    """File-upload tests must never write into the real dev media/ folder
    (disk space on prod is tight, and this repo's local media dir mirrors
    it) — point MEDIA_ROOT at a throwaway per-test directory instead."""
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def make_user(db):
    def _make(email, role=User.Role.TEACHER, approved=False, is_dev_superuser=False):
        return User.objects.create_user(
            email=email,
            password="testpass123",
            name=email.split("@")[0],
            role=role,
            approved=approved,
            is_dev_superuser=is_dev_superuser,
        )

    return _make


@pytest.fixture
def teacher(make_user):
    return make_user("teacher@example.com", role=User.Role.TEACHER, approved=True)


@pytest.fixture
def unapproved_teacher(make_user):
    return make_user("pending@example.com", role=User.Role.TEACHER, approved=False)


@pytest.fixture
def admin(make_user):
    return make_user("admin@example.com", role=User.Role.ADMIN, approved=True)


@pytest.fixture
def dev_superuser(make_user):
    return make_user("dev@example.com", role=User.Role.TEACHER, approved=False, is_dev_superuser=True)


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def as_user(api_client):
    def _as(user):
        api_client.force_authenticate(user=user)
        return api_client

    return _as


@pytest.fixture
def observer(make_user):
    return make_user("observer@example.com", role=User.Role.KUZATUVCHI, approved=True)


@pytest.fixture
def jwt_as():
    """A client authenticated with a *real* access token, so requests go
    through common/authentication.py (force_authenticate skips it — and
    with it the portal gate and session-revocation checks)."""
    from rest_framework_simplejwt.tokens import RefreshToken

    def _as(user):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {RefreshToken.for_user(user).access_token}")
        return client

    return _as


@pytest.fixture
def journal_class(teacher):
    from journal.models import JournalClass, Student

    jc = JournalClass.objects.create(teacher=teacher, name="8-A", school="1-maktab")
    for i, name in enumerate(["Aliyev Vali", "Karimova Nodira", "Toshmatov Sardor"]):
        Student.objects.create(journal_class=jc, full_name=name, order=i)
    return jc


@pytest.fixture
def make_student(db):
    def _make(journal_class, name="Aliyev Vali", approved=True, must_change_password=False):
        from learning.student_accounts import create_student_account

        user, _ = create_student_account(
            full_name=name, journal_class=journal_class, password="Talaba-2026x",
            approved=approved, must_change_password=must_change_password,
        )
        return user

    return _make


@pytest.fixture
def student(make_student, journal_class):
    return make_student(journal_class)
