from unittest.mock import patch


def test_lesson_type_round_trips_through_bulk_save(as_user, teacher):
    client = as_user(teacher)
    resp = client.post(
        '/api/timetable/slots/bulk/',
        [{'day_index': 0, 'period_index': 1, 'maktab': 'Maktab A', 'lesson_type': 'nazariy'}],
        format='json',
    )
    assert resp.status_code == 200
    assert resp.data[0]['lesson_type'] == 'nazariy'

    resp = client.get('/api/timetable/slots/')
    assert resp.data['results'][0]['lesson_type'] == 'nazariy'


def test_lesson_type_accepts_engineering(as_user, teacher):
    client = as_user(teacher)
    resp = client.post(
        '/api/timetable/slots/bulk/',
        [{'day_index': 0, 'period_index': 1, 'maktab': 'Maktab A', 'lesson_type': 'engineering'}],
        format='json',
    )
    assert resp.status_code == 200
    assert resp.data[0]['lesson_type'] == 'engineering'


def test_lesson_type_defaults_to_blank(as_user, teacher):
    client = as_user(teacher)
    resp = client.post(
        '/api/timetable/slots/bulk/',
        [{'day_index': 0, 'period_index': 1, 'maktab': 'Maktab A'}],
        format='json',
    )
    assert resp.status_code == 200
    assert resp.data[0]['lesson_type'] == ''


def test_lesson_type_rejects_unknown_value(as_user, teacher):
    client = as_user(teacher)
    resp = client.post(
        '/api/timetable/slots/bulk/',
        [{'day_index': 0, 'period_index': 1, 'maktab': 'Maktab A', 'lesson_type': 'praktik'}],
        format='json',
    )
    assert resp.status_code == 400


@patch('timetable.views.notify_admin_action')
def test_admin_cross_teacher_diff_includes_lesson_type_label(mock_notify, as_user, admin, teacher):
    client = as_user(admin)
    resp = client.post(
        f'/api/timetable/slots/bulk/?teacher={teacher.id}',
        [{'day_index': 0, 'period_index': 1, 'maktab': 'Maktab A', 'lesson_type': 'amaliy'}],
        format='json',
    )
    assert resp.status_code == 200
    mock_notify.assert_called_once()
    text = mock_notify.call_args[0][1]
    assert 'Amaliy' in text
