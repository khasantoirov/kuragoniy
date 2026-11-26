"""Each fan window shows its own only (owner, 2026-11-26: "fizika
tanlanganda faqat fizikaga oid ishlasin, steam bo'lsa faqat steam"):
notifications, announcements, the shop and Mehmon ustoz requests."""
import pytest

from announcements.models import Announcement
from notifications.models import Kind, Notification
from notifications.service import notify
from shop.models import Order, Product
from staffroom.models import GuestRequest

pytestmark = pytest.mark.django_db


def _fan(user, *subjects):
    user.subjects = list(subjects)
    user.save()
    return user


def _titles(client, fan):
    return sorted(n['title'] for n in client.get('/api/notifications/', HTTP_X_FAN=fan).data['results'])


def test_notifications_stay_in_their_window(as_user, admin):
    notify(admin, Kind.JURNAL, 'Fizika sinfi', fan='fizika')
    notify(admin, Kind.CHAMADON, 'Chamadon', fan='steam')
    notify(admin, Kind.TIZIM, 'Hisob', fan='')
    api = as_user(admin)
    assert _titles(api, 'fizika') == ['Fizika sinfi', 'Hisob']
    assert _titles(api, 'steam') == ['Chamadon', 'Hisob']
    # the bell counts the window's only, and "read all" reads the window's only
    assert api.get('/api/notifications/summary/', HTTP_X_FAN='fizika').data['unread'] == 2
    api.post('/api/notifications/read-all/', HTTP_X_FAN='fizika')
    assert Notification.objects.get(title='Chamadon').read_at is None


def test_a_one_window_announcement_reaches_that_fans_teachers(make_user, admin):
    fizika = _fan(make_user('fiz@x.uz', approved=True), 'fizika')
    steam = _fan(make_user('steam@x.uz', approved=True), 'steam')
    Announcement.objects.create(text='Robototexnika tanlovi', fan='steam', by=admin)
    assert not Notification.objects.filter(user=fizika, kind=Kind.ELON).exists()
    got = Notification.objects.get(user=steam, kind=Kind.ELON)
    assert got.fan == 'steam'
    # an everyone notice reaches both, in both windows
    Announcement.objects.create(text='Ertaga majlis', fan='', by=admin)
    assert Notification.objects.filter(user=fizika, kind=Kind.ELON, fan='').count() == 1


def test_the_shop_sells_the_windows_products(as_user, admin, teacher):
    api = as_user(admin)
    r = api.post('/api/shop/products/', {'title': 'Optika to\'plami', 'price': 1000, 'grade': 'F8'}, format='json',
                 HTTP_X_FAN='fizika')
    assert r.status_code == 201, r.data
    assert r.data['subject'] == 'fizika'
    # no grade: the window it is added in
    r = api.post('/api/shop/products/', {'title': 'Arduino to\'plami', 'price': 1000}, format='json', HTTP_X_FAN='steam')
    assert r.data['subject'] == 'steam'
    # a STEAM grade can't be given in the Fizika window
    r = api.post('/api/shop/products/', {'title': 'x', 'price': 1, 'grade': '5-6'}, format='json', HTTP_X_FAN='fizika')
    assert r.status_code == 400
    seen = lambda fan: [p['title'] for p in as_user(teacher).get('/api/shop/products/', HTTP_X_FAN=fan).data['results']]  # noqa: E731
    assert seen('fizika') == ["Optika to'plami"]
    assert seen('steam') == ["Arduino to'plami"]
    # the other window's product can't be ordered from here
    steam_kit = Product.objects.get(subject='steam')
    r = as_user(teacher).post('/api/shop/orders/', {'items': [{'product': steam_kit.pk}]}, format='json', HTTP_X_FAN='fizika')
    assert r.status_code == 400
    r = as_user(teacher).post('/api/shop/orders/', {'items': [{'product': steam_kit.pk}]}, format='json', HTTP_X_FAN='steam')
    assert r.status_code == 201, r.data
    assert Order.objects.get().fan == 'steam'
    assert as_user(teacher).get('/api/shop/orders/', HTTP_X_FAN='fizika').data['results'] == []


def test_guest_requests_stay_in_their_window(as_user, teacher):
    api = as_user(teacher)
    body = {'school_name': '1-maktab', 'class_name': '8-A', 'date': '2099-01-10'}
    assert api.post('/api/staffroom/guests/', body, format='json', HTTP_X_FAN='fizika').status_code == 201
    assert GuestRequest.objects.get().fan == 'fizika'
    assert len(api.get('/api/staffroom/guests/', HTTP_X_FAN='fizika').data) == 1
    assert api.get('/api/staffroom/guests/', HTTP_X_FAN='steam').data == []
