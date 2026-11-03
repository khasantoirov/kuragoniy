"""How marks are coloured (common.PlatformSettings.grade_palette): the same
for everyone, pupils included, and only the developer picks it."""

import pytest

pytestmark = pytest.mark.django_db
URL = "/api/common/modules/"


def test_everyone_reads_the_palette(as_user, teacher, student):
    assert as_user(teacher).get(URL).data["grade_palette"] == "aralash"
    assert as_user(student).get(URL).data["grade_palette"] == "aralash"


def test_only_the_developer_picks_it(as_user, admin, dev_superuser, teacher):
    assert as_user(admin).patch(URL, {"grade_palette": "tonal"}, format="json").status_code == 403
    assert as_user(teacher).patch(URL, {"grade_palette": "tonal"}, format="json").status_code == 403
    assert as_user(dev_superuser).patch(URL, {"grade_palette": "rainbow"}, format="json").status_code == 400
    resp = as_user(dev_superuser).patch(URL, {"grade_palette": "chiziq"}, format="json")
    assert resp.status_code == 200 and resp.data["grade_palette"] == "chiziq"
    assert as_user(teacher).get(URL).data["grade_palette"] == "chiziq"
