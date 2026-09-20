"""A linked colleague's Telegram chat id is admin-only on /accounts/users/
— see accounts/serializers.py::AdminUserSerializer and
UserAdminViewSet.get_serializer_class. A plain teacher hitting the same
list must not see it.

The admin staff card no longer prints the id (it was noise next to the
@username), but the field is still served to admins, so the boundary
still has to hold.
"""

import pytest

pytestmark = pytest.mark.django_db


def _link(user, chat_id):
    user.telegram_linked = True
    user.telegram_chat_id = chat_id
    user.telegram_username = 'somebody'
    user.save()


def test_admin_sees_telegram_chat_id_in_user_list(as_user, admin, teacher):
    _link(teacher, 123456)
    resp = as_user(admin).get('/api/accounts/users/')
    assert resp.status_code == 200
    row = next(r for r in resp.data['results'] if r['id'] == teacher.id)
    assert row['telegram_chat_id'] == 123456


def test_plain_teacher_does_not_see_telegram_chat_id(as_user, teacher, make_user):
    other = make_user('colleague@example.com', approved=True)
    _link(other, 999999)
    resp = as_user(teacher).get('/api/accounts/users/')
    assert resp.status_code == 200
    row = next(r for r in resp.data['results'] if r['id'] == other.id)
    assert 'telegram_chat_id' not in row


def test_boshliq_also_sees_telegram_chat_id(as_user, make_user, teacher):
    from accounts.models import User
    boshliq = make_user('boss@example.com', role=User.Role.BOSHLIQ, approved=True)
    _link(teacher, 555)
    resp = as_user(boshliq).get('/api/accounts/users/')
    assert resp.status_code == 200
    row = next(r for r in resp.data['results'] if r['id'] == teacher.id)
    assert row['telegram_chat_id'] == 555
