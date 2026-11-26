"""STEM do'kon for schools (owner's choice, 2026-11-26): teachers and a
school's ma'muriyat order, the administration hears of every new order at
once, the read-only Kuzatuvchi doesn't buy. Real tokens (jwt_as), so the
read-only gate of common/authentication.py is on the way."""

import pytest

from accounts.models import User
from notifications.models import Notification
from shop.models import Order, Product

pytestmark = pytest.mark.django_db
ORDERS = '/api/shop/orders/'


@pytest.fixture
def kit():
    return Product.objects.create(title="STEM to'plam 1", kind='jihoz', delivery='physical', price=3_200_000)


def _order(client, kit):
    return client.post(ORDERS, {'items': [{'product': kit.pk, 'quantity': 2}], 'phone': '+998901112233',
                                'delivery_address': 'Toshkent, 156-maktab'}, format='json')


def test_a_schools_mamuriyat_orders_and_the_admins_hear(jwt_as, make_user, admin, kit):
    boss = make_user('direktor@example.com', role=User.Role.MAKTAB, approved=True)
    r = _order(jwt_as(boss), kit)
    assert r.status_code == 201, r.data
    order = Order.objects.get()
    assert order.total == 6_400_000 and order.status == Order.Status.PENDING
    assert order.number.startswith('KE-')
    note = Notification.objects.get(user=admin, kind='dokon')
    assert order.number in note.title
    # their own orders only; nothing else becomes writable for them
    assert jwt_as(boss).get(ORDERS).data['results'][0]['id'] == order.pk
    assert jwt_as(boss).post('/api/shop/products/', {'title': 'x', 'price': 1}, format='json').status_code == 403


def test_a_teacher_orders(jwt_as, teacher, kit):
    assert _order(jwt_as(teacher), kit).status_code == 201


def test_the_read_only_kuzatuvchi_does_not(jwt_as, observer, kit):
    assert _order(jwt_as(observer), kit).status_code == 403
    assert not Order.objects.exists()
