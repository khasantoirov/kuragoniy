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
