"""Admin content changes (lessons, library, timetable, user management)
should notify the developer via Telegram — see common/audit.py. These
tests patch notify_admin_action at each call site rather than hitting the
network, and just check it fires with a sensible description naming the
acting admin and what changed.
"""

from unittest.mock import patch

import pytest

from accounts.models import User
from lessons.models import Experiment, Lesson
from library.models import LibraryItem

pytestmark = pytest.mark.django_db


@patch('lessons.views.notify_admin_action')
def test_creating_a_lesson_notifies_dev(mock_notify, as_user, admin):
    client = as_user(admin)
    resp = client.post(
        '/api/lessons/',
        {'title': 'Test dars', 'grade': 7, 'chorak': 1, 'hafta': 1, 'cat': 'boshqa', 'goal': ''},
        format='json',
    )
    assert resp.status_code == 201
    mock_notify.assert_called_once()
    actor, text = mock_notify.call_args[0]
    assert actor == admin
    assert 'Test dars' in text


@patch('lessons.views.notify_admin_action')
def test_deleting_a_lesson_notifies_dev(mock_notify, as_user, admin):
    lesson = Lesson.objects.create(title="O'chiriladigan", grade=7, chorak=1, hafta=1)
    client = as_user(admin)
    resp = client.delete(f'/api/lessons/{lesson.id}/')
    assert resp.status_code == 204
    mock_notify.assert_called_once()
    assert "o'chirdi" in mock_notify.call_args[0][1]


@patch('lessons.views.notify_admin_action')
def test_editing_a_lesson_shows_before_and_after_per_field(mock_notify, as_user, admin):
    lesson = Lesson.objects.create(title='Eski nom', grade=7, chorak=1, hafta=1, goal='Eski maqsad')
    client = as_user(admin)
    resp = client.patch(f'/api/lessons/{lesson.id}/', {'title': 'Yangi nom', 'goal': 'Yangi maqsad'}, format='json')
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert 'Eski nom' in text and 'Yangi nom' in text
    assert 'Eski maqsad' in text and 'Yangi maqsad' in text


@patch('lessons.views.notify_admin_action')
def test_editing_a_lesson_without_real_changes_does_not_notify(mock_notify, as_user, admin):
    lesson = Lesson.objects.create(title='O\'zgarmas', grade=7, chorak=1, hafta=1)
    client = as_user(admin)
    resp = client.patch(f'/api/lessons/{lesson.id}/', {'title': "O'zgarmas"}, format='json')
    assert resp.status_code == 200
    mock_notify.assert_not_called()


@patch('lessons.views.notify_admin_action')
def test_adding_an_experiment_via_lesson_update_notifies(mock_notify, as_user, admin):
    lesson = Lesson.objects.create(title='Dars', grade=7, chorak=1, hafta=1)
    client = as_user(admin)
    resp = client.patch(
        f'/api/lessons/{lesson.id}/',
        {'experiments': [{'name': 'Yangi tajriba', 'type': 'oddiy', 'desc': '', 'materials': [], 'steps': []}]},
        format='json',
    )
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert "+ Tajriba qo'shildi: «Yangi tajriba»" in text


@patch('lessons.views.notify_admin_action')
def test_editing_an_experiment_field_shows_diff(mock_notify, as_user, admin):
    lesson = Lesson.objects.create(title='Dars', grade=7, chorak=1, hafta=1)
    exp = Experiment.objects.create(lesson=lesson, name='Eski tajriba', desc='Eski tavsif')
    client = as_user(admin)
    resp = client.patch(
        f'/api/lessons/{lesson.id}/',
        {'experiments': [{'id': exp.id, 'name': 'Yangi tajriba', 'type': 'oddiy', 'desc': 'Yangi tavsif', 'materials': [], 'steps': []}]},
        format='json',
    )
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert '~ Tajriba tahrirlandi: «Yangi tajriba»' in text
    assert 'Eski tavsif' in text and 'Yangi tavsif' in text


@patch('lessons.views.notify_admin_action')
def test_removing_an_experiment_via_lesson_update_notifies(mock_notify, as_user, admin):
    lesson = Lesson.objects.create(title='Dars', grade=7, chorak=1, hafta=1)
    Experiment.objects.create(lesson=lesson, name="O'chiriladigan tajriba")
    client = as_user(admin)
    resp = client.patch(f'/api/lessons/{lesson.id}/', {'experiments': []}, format='json')
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert "- Tajriba o'chirildi: «O'chiriladigan tajriba»" in text


@patch('lessons.views.notify_admin_action')
def test_deleting_a_lesson_lists_its_experiments_and_goal(mock_notify, as_user, admin):
    lesson = Lesson.objects.create(title="O'chiriladigan", grade=7, chorak=1, hafta=1, goal='Muhim maqsad')
    Experiment.objects.create(lesson=lesson, name='Ichidagi tajriba')
    client = as_user(admin)
    resp = client.delete(f'/api/lessons/{lesson.id}/')
    assert resp.status_code == 204
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert 'Muhim maqsad' in text
    assert 'Ichidagi tajriba' in text


@patch('lessons.views.notify_admin_action')
def test_moving_a_lesson_shows_original_and_new_location(mock_notify, as_user, admin):
    lesson = Lesson.objects.create(title='Ko\'chadigan', grade=7, chorak=1, hafta=1)
    client = as_user(admin)
    resp = client.post(f'/api/lessons/{lesson.id}/move-copy/', {'mode': 'move', 'grade': 8, 'chorak': 3}, format='json')
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert '7-sinf, 1-chorak' in text
    assert '8-sinf, 3-chorak' in text


@patch('lessons.views.notify_admin_action')
def test_toggling_quarter_lock_shows_before_and_after_state(mock_notify, as_user, admin):
    client = as_user(admin)
    resp = client.post('/api/lessons/quarter-locks/', {'chorak': 2, 'is_open': True}, format='json')
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    assert 'yopiq → ochiq' in mock_notify.call_args[0][1]

    mock_notify.reset_mock()
    # Setting it to the same state again should not re-notify.
    resp = client.post('/api/lessons/quarter-locks/', {'chorak': 2, 'is_open': True}, format='json')
    assert resp.status_code == 200
    mock_notify.assert_not_called()


@patch('library.views.notify_admin_action')
def test_editing_a_library_item_shows_field_diff(mock_notify, as_user, admin):
    item = LibraryItem.objects.create(title='Eski kitob', kind=LibraryItem.Kind.KITOB)
    client = as_user(admin)
    resp = client.patch(f'/api/library/{item.id}/', {'title': 'Yangi kitob'}, format='json')
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert 'Eski kitob' in text and 'Yangi kitob' in text


@patch('accounts.views.notify_admin_action')
def test_promoting_a_user_shows_role_diff(mock_notify, as_user, dev_superuser, teacher):
    client = as_user(dev_superuser)
    resp = client.post(f'/api/accounts/users/{teacher.id}/promote/')
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert "O'qituvchi" in text and 'Administrator' in text


@patch('timetable.views.notify_admin_action')
def test_admin_editing_another_teachers_timetable_shows_slot_diff(mock_notify, as_user, admin, teacher):
    client = as_user(admin)
    resp = client.post(
        f'/api/timetable/slots/bulk/?teacher={teacher.id}',
        [{'day_index': 0, 'period_index': 1, 'time_from': '09:00', 'time_to': '09:40', 'maktab': 'Maktab A', 'xona': '', 'sinf': ''}],
        format='json',
    )
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert '+ Dushanba, 1-soat' in text
    assert 'Maktab A' in text


@patch('timetable.views.notify_admin_action')
def test_teacher_editing_own_timetable_does_not_notify_dev(mock_notify, as_user, teacher):
    """Editing your own schedule is normal usage for any approved user,
    not an oversight-worthy admin action — only cross-teacher edits are."""
    client = as_user(teacher)
    resp = client.post(
        '/api/timetable/slots/bulk/',
        [{'day_index': 0, 'period_index': 1, 'maktab': 'Maktab A'}],
        format='json',
    )
    assert resp.status_code == 200
    mock_notify.assert_not_called()


@patch('lessons.views.notify_admin_action')
def test_teacher_action_never_notifies_dev(mock_notify, as_user, teacher):
    """Only admin-gated endpoints call notify_admin_action — a teacher
    can't reach these at all (permission-denied), so nothing should fire."""
    client = as_user(teacher)
    resp = client.post(
        '/api/lessons/',
        {'title': 'Ruxsatsiz', 'grade': 7, 'chorak': 1, 'hafta': 1, 'cat': 'boshqa', 'goal': ''},
        format='json',
    )
    assert resp.status_code == 403
    mock_notify.assert_not_called()


@patch('library.views.notify_admin_action')
def test_creating_a_library_item_notifies_dev(mock_notify, as_user, admin):
    client = as_user(admin)
    resp = client.post(
        '/api/library/',
        {'title': 'Test kitob', 'kind': LibraryItem.Kind.KITOB, 'url': ''},
        format='json',
    )
    assert resp.status_code == 201
    mock_notify.assert_called_once()
    assert 'Test kitob' in mock_notify.call_args[0][1]


@patch('accounts.views.notify_admin_action')
def test_approving_a_user_notifies_dev(mock_notify, as_user, admin, unapproved_teacher):
    client = as_user(admin)
    resp = client.post(f'/api/accounts/users/{unapproved_teacher.id}/approve/')
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    actor, text = mock_notify.call_args[0]
    assert actor == admin
    assert unapproved_teacher.email in text


@pytest.mark.django_db(transaction=True)
@patch('common.audit.urllib.request.urlopen')
def test_notify_admin_action_reaches_every_linked_dev_including_the_actor(mock_urlopen, make_user, settings, monkeypatch):
    """Direct unit test of the notify function itself: this is a full
    audit log, so the acting dev-superuser gets DM'd about their own
    changes too — only an *unlinked* dev-superuser is skipped (nowhere to
    send it).

    Needs a real (non-transactional) DB: notify_admin_action queries from
    a background thread on its own connection, which can't see rows still
    sitting inside the default test-wrapping transaction another
    connection holds — see common/audit.py's "best-effort" comment.
    """
    from common.audit import notify_admin_action

    monkeypatch.setenv('BOT_TOKEN', 'test-token')

    acting_dev = make_user('acting-dev@example.com', is_dev_superuser=True)
    acting_dev.telegram_linked = True
    acting_dev.telegram_chat_id = 111
    acting_dev.save()

    other_dev = make_user('other-dev@example.com', is_dev_superuser=True)
    other_dev.telegram_linked = True
    other_dev.telegram_chat_id = 222
    other_dev.save()

    unlinked_dev = make_user('unlinked-dev@example.com', is_dev_superuser=True)

    notify_admin_action(acting_dev, 'Test xabari')

    # notify_admin_action spawns a background thread — join it via the
    # thread registry isn't exposed, so just run the same query the
    # thread would and assert on the call Telegram would have received
    # once the thread has had a chance to run.
    import time
    for _ in range(20):
        if mock_urlopen.call_count >= 2:
            break
        time.sleep(0.05)

    sent_chat_ids = set()
    for call in mock_urlopen.call_args_list:
        req = call.args[0]
        import json as _json
        sent_chat_ids.add(_json.loads(req.data)['chat_id'])
    assert sent_chat_ids == {111, 222}


@pytest.mark.django_db(transaction=True)
@patch('common.audit.urllib.request.urlopen')
def test_notify_admin_action_also_reaches_admins_and_boshliq_but_not_teachers(mock_urlopen, make_user, monkeypatch):
    """Admins and boshliq get the same audit DMs the dev-superuser does —
    a plain teacher (even if linked) never does, since they can't reach
    any of the admin-gated endpoints that call notify_admin_action."""
    from common.audit import notify_admin_action

    monkeypatch.setenv('BOT_TOKEN', 'test-token')

    acting_admin = make_user('acting-admin@example.com', role='admin')
    acting_admin.telegram_linked = True
    acting_admin.telegram_chat_id = 11
    acting_admin.save()

    boshliq = make_user('boshliq2@example.com', role='boshliq')
    boshliq.telegram_linked = True
    boshliq.telegram_chat_id = 22
    boshliq.save()

    linked_teacher = make_user('linked-teacher@example.com')
    linked_teacher.telegram_linked = True
    linked_teacher.telegram_chat_id = 33
    linked_teacher.save()

    notify_admin_action(acting_admin, 'Test xabari')

    import time
    for _ in range(20):
        if mock_urlopen.call_count >= 2:
            break
        time.sleep(0.05)

    sent_chat_ids = set()
    for call in mock_urlopen.call_args_list:
        req = call.args[0]
        import json as _json
        sent_chat_ids.add(_json.loads(req.data)['chat_id'])
    assert sent_chat_ids == {11, 22}
