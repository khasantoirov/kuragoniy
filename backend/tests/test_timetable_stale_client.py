"""The timetable's "lesson type" (nazariy / amaliy / engineering) was removed.

A browser that loaded the app before the deploy is still running the old
frontend until its owner accepts the update banner (the PWA does not reload
itself — see UpdatePrompt), and that old code keeps sending `lesson_type`
on every save. The API must shrug it off rather than reject the whole week:
a 400 here would mean a teacher's timetable edit silently fails until they
refresh.
"""

import pytest

pytestmark = pytest.mark.django_db

URL = "/api/timetable/slots/bulk/"


def test_bulk_save_ignores_a_stale_clients_lesson_type(as_user, teacher):
    resp = as_user(teacher).post(
        URL,
        [{"day_index": 0, "period_index": 1, "maktab": "Maktab A", "lesson_type": "nazariy"}],
        format="json",
    )
    assert resp.status_code == 200
    assert resp.data[0]["maktab"] == "Maktab A"


def test_slot_payload_no_longer_carries_lesson_type(as_user, teacher):
    as_user(teacher).post(
        URL,
        [{"day_index": 0, "period_index": 1, "maktab": "Maktab A"}],
        format="json",
    )
    resp = as_user(teacher).get("/api/timetable/slots/")
    rows = resp.data["results"] if isinstance(resp.data, dict) else resp.data
    assert "lesson_type" not in rows[0]
