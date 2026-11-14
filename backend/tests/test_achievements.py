"""Reyting va nishonlar: badges counted from stored work (tiers kept, never
lost), quiet on the first count and announced after, the pupils' own
badges, and the monthly teacher activity ranking."""

from datetime import timedelta

import pytest
from django.utils import timezone

from accounts.models import User
from achievements import badges
from achievements.models import UserBadge
from journal.models import ClassDay, JournalClass
from learning.models import Attempt, LessonReport
from lessons.models import Lesson
from notifications.models import Notification

pytestmark = pytest.mark.django_db


def _reports(teacher, n, rating=None):
    for i in range(n):
        LessonReport.objects.create(teacher=teacher, date=timezone.localdate(), topic=f'Mavzu {i}', summary='...',
                                    rating=rating, reviewed_at=timezone.now() if rating else None)


def test_first_count_is_quiet_then_new_tiers_are_announced(as_user, teacher):
    _reports(teacher, 1)
    data = as_user(teacher).get('/api/achievements/badges/').data
    row = next(b for b in data if b['key'] == 'hisobot')
    assert row['tier'] == 1 and row['tier_name'] == 'bronza' and row['next'] == 10 and row['value'] == 1
    assert not Notification.objects.filter(user=teacher, kind='ragbat').exists()
    _reports(teacher, 9, rating=5)
    assert badges.sync([teacher]) >= 2  # hisobot → kumush, a'lo dars → kumush
    assert UserBadge.objects.get(user=teacher, key='hisobot').tier == 2
    assert Notification.objects.filter(user=teacher, kind='ragbat', title__contains='Dars hisobotlari').exists()
    # a tier is never lost
    LessonReport.objects.filter(teacher=teacher).delete()
    badges.sync([teacher])
    assert UserBadge.objects.get(user=teacher, key='hisobot').tier == 2


def test_journal_days_and_readiness(as_user, teacher):
    jc = JournalClass.objects.create(teacher=teacher, name='7-A')
    for i in range(20):
        ClassDay.objects.create(journal_class=jc, date=timezone.localdate() - timedelta(days=i), chorak=1)
    lesson = Lesson.objects.create(title='Bosim', grade=Lesson.Grade.values[0], chorak=1, hafta=1)
    for pct in (50, 80, 90):  # one lesson counts once, only when passed
        Attempt.objects.create(user=teacher, kind=Attempt.Kind.READINESS, lesson=lesson, percent=pct,
                               submitted_at=timezone.now())
    data = {b['key']: b for b in as_user(teacher).get('/api/achievements/badges/').data}
    assert data['jurnal']['tier'] == 1 and data['jurnal']['value'] == 20
    assert data['tayyor']['value'] == 1 and data['tayyor']['tier'] == 0


def test_pupil_badges(jwt_as, make_user):
    pupil = make_user('pupil@x.uz', role=User.Role.STUDENT, approved=True)
    lesson = Lesson.objects.create(title='Bosim', grade=Lesson.Grade.values[0], chorak=1, hafta=1)
    Attempt.objects.create(user=pupil, kind=Attempt.Kind.PRACTICE, lesson=lesson, percent=100,
                           submitted_at=timezone.now())
    data = {b['key']: b for b in jwt_as(pupil).get('/api/student/badges/').data}
    assert data['test']['tier'] == 1 and data['yuz_ball']['tier'] == 1
    assert 'hisobot' not in data
    # pupils stay out of the staff side
    assert jwt_as(pupil).get('/api/achievements/leaderboard/').status_code == 403


def test_monthly_leaderboard(as_user, teacher, make_user, observer):
    other = make_user('other@x.uz', approved=True)
    _reports(teacher, 2, rating=5)
    _reports(other, 1)
    old = LessonReport.objects.create(teacher=other, date=timezone.localdate(), topic='Eski', summary='...')
    LessonReport.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=70))
    data = as_user(teacher).get('/api/achievements/leaderboard/').data
    rows = {r['user']: r for r in data['rows']}
    assert rows[teacher.id]['points'] == 2 * 10 + 2 * 5 and rows[teacher.id]['rank'] == 1
    assert rows[other.id]['points'] == 10  # last-but-one month's report doesn't count
    assert as_user(observer).get('/api/achievements/leaderboard/').status_code == 200
    assert as_user(observer).get('/api/achievements/badges/').status_code == 403
    month = (timezone.localdate().replace(day=1) - timedelta(days=1)).strftime('%Y-%m')
    prev = as_user(teacher).get('/api/achievements/leaderboard/', {'month': month}).data
    assert prev['month'] == month


def test_sync_all_covers_teachers_and_pupils(teacher, make_user):
    pupil = make_user('pupil@x.uz', role=User.Role.STUDENT, approved=True)
    _reports(teacher, 1)
    lesson = Lesson.objects.create(title='Bosim', grade=Lesson.Grade.values[0], chorak=1, hafta=1)
    Attempt.objects.create(user=pupil, kind=Attempt.Kind.PRACTICE, lesson=lesson, percent=60, submitted_at=timezone.now())
    assert badges.sync_all() == 0  # first count: quiet
    assert UserBadge.objects.filter(user=teacher, key='hisobot').exists()
    assert UserBadge.objects.filter(user=pupil, key='test').exists()
