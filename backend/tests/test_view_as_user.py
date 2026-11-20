"""Dasturchi → Rol (common/viewas.py): the developer sees the platform as a
chosen person or role — read-only, and only the developer."""
import pytest

from accounts.models import User
from common.models import AuditLog

pytestmark = pytest.mark.django_db


def _view(client, key):
    client.credentials(HTTP_AUTHORIZATION=client._credentials['HTTP_AUTHORIZATION'], HTTP_X_VIEW_AS_USER=key)
    return client


def test_developer_sees_a_teacher_as_they_do(jwt_as, dev_superuser, teacher):
    teacher.must_change_password = True
    teacher.save()
    client = _view(jwt_as(dev_superuser), teacher.pk)
    me = client.get('/api/accounts/me/')
    assert me.status_code == 200
    assert me.data['id'] == teacher.pk and me.data['role'] == 'teacher' and not me.data['is_dev_superuser']
    assert me.data['viewing']['label'] == f"O'qituvchi — {teacher.name}"
    assert me.data['viewing']['by'] == dev_superuser.name
    assert me.data['must_change_password'] is False  # the person's own business
    # with the teacher's rights: the administration's audit log is closed
    assert client.get('/api/accounts/audit-log/').status_code == 403


def test_nothing_is_written_while_viewing(jwt_as, dev_superuser, teacher):
    client = _view(jwt_as(dev_superuser), teacher.pk)
    resp = client.patch('/api/accounts/me/', {'first_name': 'Buzilgan'}, format='json')
    assert resp.status_code == 403
    teacher.refresh_from_db()
    assert teacher.first_name != 'Buzilgan'
    # the heartbeat still goes through — as the developer
    assert client.post('/api/accounts/me/heartbeat/').status_code == 204


def test_role_view_on_own_account_never_touches_it(jwt_as, dev_superuser):
    client = _view(jwt_as(dev_superuser), 'role:admin')
    me = client.get('/api/accounts/me/')
    assert me.data['role'] == 'admin' and me.data['is_dev_superuser'] is False
    assert me.data['viewing']['label'] == "Admin (o'zingiz)"
    assert client.post('/api/accounts/me/heartbeat/').status_code == 204
    dev_superuser.refresh_from_db()
    assert dev_superuser.role == 'teacher' and dev_superuser.is_dev_superuser


def test_only_the_developer_can_look_through_others(jwt_as, admin, teacher):
    client = _view(jwt_as(admin), teacher.pk)
    me = client.get('/api/accounts/me/')
    assert me.data['id'] == admin.pk and me.data['viewing'] is None  # header ignored
    assert jwt_as(admin).get('/api/accounts/view-as/?role=teacher').status_code == 403


def test_picker_lists_and_logs(jwt_as, dev_superuser, teacher, make_user):
    pupil = make_user('pupil@example.com', role=User.Role.STUDENT, approved=True)
    client = jwt_as(dev_superuser)
    people = client.get('/api/accounts/view-as/?role=teacher').data
    assert [p['id'] for p in people] == [teacher.pk]
    assert client.get('/api/accounts/view-as/?role=student').status_code == 400

    assert client.post('/api/accounts/view-as/', {'key': pupil.pk}, format='json').status_code == 400
    resp = client.post('/api/accounts/view-as/', {'key': teacher.pk}, format='json')
    assert resp.status_code == 200 and resp.data['label'].startswith("O'qituvchi")
    assert AuditLog.objects.filter(action='view_as_user', actor=dev_superuser).exists()


def test_a_gone_view_is_refused(jwt_as, dev_superuser, teacher):
    teacher.is_active = False
    teacher.save()
    resp = _view(jwt_as(dev_superuser), teacher.pk).get('/api/accounts/me/')
    assert resp.status_code == 403
