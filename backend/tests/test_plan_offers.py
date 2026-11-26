"""Obuna tariflari (schools/offers.py): the administration writes the
plans' prices and contents and uploads the contract template; schools read
the visible ones. Nothing is invented: an empty plan isn't shown."""

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

pytestmark = pytest.mark.django_db
URL = '/api/schools/offers/'


def test_admin_writes_schools_read(as_user, admin, teacher):
    r = as_user(admin).put(URL, {'plans': [
        {'plan': 'standart', 'price': "15 000 so'm / o'quvchi / chorak", 'features': "Barcha darslar\nMetodik yordam"},
        {'plan': 'premium', 'price': "45 000 so'm / o'quvchi / yil", 'recommended': True},
    ], 'payment_note': "Bank o'tkazmasi, shartnoma asosida"}, format='json')
    assert r.status_code == 200, r.data
    assert [p['plan'] for p in r.data['plans']] == ['sinov', 'standart', 'premium']  # an admin sees all
    seen = as_user(teacher).get(URL).data
    # the empty "sinov" isn't shown to schools; the order follows the plans
    assert [(p['plan'], p['recommended']) for p in seen['plans']] == [('standart', False), ('premium', True)]
    assert seen['payment_note'] == "Bank o'tkazmasi, shartnoma asosida"


def test_a_hidden_plan_stays_hidden(as_user, admin, teacher):
    as_user(admin).put(URL, {'plans': [{'plan': 'premium', 'price': '1', 'is_visible': False}]}, format='json')
    assert all(p['plan'] != 'premium' for p in as_user(teacher).get(URL).data['plans'])


def test_only_the_administration_writes(as_user, teacher, observer):
    assert as_user(teacher).put(URL, {'payment_note': 'x'}, format='json').status_code == 403
    assert as_user(observer).put(URL, {'payment_note': 'x'}, format='json').status_code == 403


def test_the_contract_template(as_user, admin, teacher):
    pdf = SimpleUploadedFile('shartnoma.pdf', b'%PDF-1.4\n%test\n', content_type='application/pdf')
    r = as_user(admin).post(f'{URL}contract/', {'file': pdf}, format='multipart')
    assert r.status_code == 200, r.data
    assert r.data['contract_name'] == 'shartnoma.pdf'
    assert as_user(teacher).get(URL).data['contract_url'].endswith('shartnoma.pdf')
    bad = SimpleUploadedFile('virus.exe', b'MZ', content_type='application/octet-stream')
    assert as_user(admin).post(f'{URL}contract/', {'file': bad}, format='multipart').status_code == 400
    assert as_user(admin).delete(f'{URL}contract/').data['contract_url'] is None
