"""Yordam markazi: the questions and answers (seeded once, edited by the
administration) and murojaatlar — a conversation between a staff member
and the administration, the read-only roles included."""

import pytest

from accounts.models import User
from helpdesk.models import FaqItem, Ticket
from notifications.models import Notification

pytestmark = pytest.mark.django_db


def test_faq_seeded_and_admin_edits(as_user, admin, teacher):
    items = as_user(teacher).get('/api/help/faq/').data['items']
    assert len(items) >= 8 and any("Parolimni" in i['question'] for i in items)
    assert as_user(teacher).post('/api/help/faq/', {'question': 'x', 'answer': 'y'}, format='json').status_code == 403
    made = as_user(admin).post('/api/help/faq/', {'category': 'jurnal', 'question': 'Yangi savol?', 'answer': 'Javob.',
                                                  'is_published': False}, format='json')
    assert made.status_code == 201
    assert all(i['id'] != made.data['id'] for i in as_user(teacher).get('/api/help/faq/').data['items'])
    assert any(i['id'] == made.data['id'] for i in as_user(admin).get('/api/help/faq/').data['items'])
    assert as_user(admin).patch(f"/api/help/faq/{made.data['id']}/", {'is_published': True}, format='json').status_code == 200
    assert any(i['id'] == made.data['id'] for i in as_user(teacher).get('/api/help/faq/').data['items'])
    assert as_user(admin).delete(f"/api/help/faq/{made.data['id']}/").status_code == 204
    assert as_user(admin).post('/api/help/faq/', {'question': ' ', 'answer': 'y'}, format='json').status_code == 400


def test_ticket_conversation(as_user, admin, teacher, make_user):
    other = make_user('other@x.uz', approved=True)
    c = as_user(teacher)
    assert c.post('/api/help/tickets/', {'subject': '', 'body': 'x'}, format='json').status_code == 400
    resp = c.post('/api/help/tickets/', {'subject': 'Jurnal ochilmayapti', 'category': 'jurnal',
                                         'body': "7-A jurnali bo'sh ko'rinyapti", 'page': '/journal'}, format='json')
    assert resp.status_code == 201 and resp.data['status'] == 'yangi' and len(resp.data['messages']) == 1
    tid = resp.data['id']
    assert Notification.objects.filter(user=admin, kind='yordam').exists()
    assert as_user(other).get(f'/api/help/tickets/{tid}/').status_code == 403
    assert as_user(other).get('/api/help/tickets/').data == []

    ans = as_user(admin).post(f'/api/help/tickets/{tid}/messages/', {'body': "Sahifani yangilang"}, format='json')
    assert ans.status_code == 201 and ans.data['status'] == 'javob' and ans.data['messages'][-1]['staff'] is True
    assert Notification.objects.filter(user=teacher, kind='yordam').exists()

    Notification.objects.all().delete()
    again = as_user(teacher).post(f'/api/help/tickets/{tid}/messages/', {'body': 'Yordam bermadi'}, format='json')
    assert again.data['status'] == 'yangi'
    assert Notification.objects.filter(user=admin, kind='yordam').exists()

    done = as_user(admin).patch(f'/api/help/tickets/{tid}/', {'status': 'hal'}, format='json')
    assert done.data['status'] == 'hal' and done.data['solved_at']
    # writing again reopens it
    re = as_user(teacher).post(f'/api/help/tickets/{tid}/messages/', {'body': 'Yana chiqdi'}, format='json')
    assert re.data['status'] == 'yangi' and re.data['solved_at'] is None
    rows = as_user(admin).get('/api/help/tickets/', {'all': '1', 'status': 'open'}).data
    assert [r['id'] for r in rows] == [tid] and rows[0]['messages_count'] == 4


def test_read_only_roles_may_ask(jwt_as, make_user, observer):
    boss = make_user('boss@x.uz', role=User.Role.MAKTAB, approved=True)
    for who in (boss, observer):
        resp = jwt_as(who).post('/api/help/tickets/', {'subject': 'Savol', 'body': 'Qanday?'}, format='json')
        assert resp.status_code == 201, resp.data
    assert Ticket.objects.count() == 2
    # but not edit the answers
    assert jwt_as(boss).post('/api/help/faq/', {'question': 'q', 'answer': 'a'}, format='json').status_code == 403


def test_daily_limit(as_user, teacher):
    c = as_user(teacher)
    for i in range(10):
        assert c.post('/api/help/tickets/', {'subject': f'S{i}', 'body': 'b'}, format='json').status_code == 201
    assert c.post('/api/help/tickets/', {'subject': 'S11', 'body': 'b'}, format='json').status_code == 400


def test_students_have_no_help_desk(jwt_as, make_user):
    pupil = make_user('pupil@x.uz', role=User.Role.STUDENT, approved=True)
    assert jwt_as(pupil).get('/api/help/faq/').status_code == 403
    assert FaqItem.objects.exists()
