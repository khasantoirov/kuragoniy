"""Ustozlar lentasi, Reyting and Yordam markazi by fan window: Fizika and
STEAM each see their own (common/subjects.window via X-Fan)."""
import importlib

import pytest
from django.apps import apps
from django.utils import timezone

from feed.models import Post
from helpdesk.models import Ticket
from learning.models import LessonReport
from notifications.models import Notification

pytestmark = pytest.mark.django_db


def _fan(user, *subjects):
    user.subjects = list(subjects)
    user.save()
    return user


def test_feed_posts_stay_in_their_window(as_user, teacher, admin, make_user):
    _fan(teacher, 'fizika')
    steam = _fan(make_user('steam@x.uz', approved=True), 'steam')
    # a physics-only teacher's post is Fizika's even from an old client (no header)
    resp = as_user(teacher).post('/api/feed/', {'body': 'Geron fontani zo\'r chiqdi'}, format='json')
    assert resp.status_code == 201
    assert Post.objects.get(pk=resp.data['id']).fan == 'fizika'
    # the administration writes into the window it is in
    resp = as_user(admin).post('/api/feed/', {'body': 'Robot tanlovi'}, format='json', HTTP_X_FAN='steam')
    steam_post = Post.objects.get(pk=resp.data['id'])
    assert steam_post.fan == 'steam'

    seen = lambda client, fan: [p['body'] for p in client.get('/api/feed/', HTTP_X_FAN=fan).data['posts']]  # noqa: E731
    assert seen(as_user(steam), 'steam') == ['Robot tanlovi']
    assert seen(as_user(admin), 'fizika') == ["Geron fontani zo'r chiqdi"]
    # the other window's post can't be liked or commented from here
    assert as_user(teacher).post(f'/api/feed/{steam_post.id}/like/', HTTP_X_FAN='fizika').status_code == 404
    assert as_user(teacher).get(f'/api/feed/{steam_post.id}/comments/', HTTP_X_FAN='fizika').status_code == 404


def test_rating_lists_the_windows_teachers(as_user, teacher, make_user):
    _fan(teacher, 'fizika')
    steam = _fan(make_user('steam@x.uz', approved=True), 'steam')
    for who in (teacher, steam):
        LessonReport.objects.create(teacher=who, date=timezone.localdate(), topic='Mavzu', summary='...')
    rows = lambda client, fan: {r['user'] for r in client.get('/api/achievements/leaderboard/', HTTP_X_FAN=fan).data['rows']}  # noqa: E731
    assert rows(as_user(teacher), 'fizika') == {teacher.id}
    assert rows(as_user(steam), 'steam') == {steam.id}
    assert rows(as_user(teacher), '') == {teacher.id}  # a one-fan teacher is always in theirs


def test_help_tickets_reach_their_windows_administration(as_user, teacher, admin, make_user):
    _fan(teacher, 'fizika')
    steam_admin = _fan(make_user('sadmin@x.uz', role='admin', approved=True), 'steam')
    resp = as_user(teacher).post('/api/help/tickets/', {'subject': 'Jurnal ochilmayapti', 'body': 'Yordam bering'},
                                 format='json')
    assert resp.status_code == 201
    assert Ticket.objects.get(pk=resp.data['id']).fan == 'fizika'
    # the both-fans admin hears of it, the STEAM-only admin doesn't
    assert Notification.objects.filter(user=admin, kind='yordam').exists()
    assert not Notification.objects.filter(user=steam_admin, kind='yordam').exists()

    listed = lambda fan: [t['subject'] for t in as_user(admin).get('/api/help/tickets/?all=1', HTTP_X_FAN=fan).data]  # noqa: E731
    assert listed('fizika') == ['Jurnal ochilmayapti']
    assert listed('steam') == []
    # the author always sees their own
    assert len(as_user(teacher).get('/api/help/tickets/').data) == 1


def test_old_rows_follow_their_author(teacher, make_user):
    _fan(teacher, 'fizika')
    other = make_user('both@x.uz', approved=True)
    Post.objects.create(author=teacher, body='a')
    Post.objects.create(author=other, body='b')
    Ticket.objects.create(author=teacher, subject='x')
    for mod, label in (('feed.migrations.0003_fan', 'feed.Post'), ('helpdesk.migrations.0003_fan', 'helpdesk.Ticket')):
        importlib.import_module(mod).by_author(label)(apps, None)
    assert dict(Post.objects.values_list('body', 'fan')) == {'a': 'fizika', 'b': 'steam'}
    assert Ticket.objects.get().fan == 'fizika'
