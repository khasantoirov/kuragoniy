"""Rejecting a sign-up deletes it; an account with a journal or a timetable
is never deleted (a teacher who left is blocked instead)."""
from accounts.models import User
from journal.models import JournalClass, Student
from timetable.models import TimetableSlot


def test_a_bare_sign_up_is_rejected(as_user, admin, make_user):
    newcomer = make_user(email='yangi@test.uz', approved=False)
    assert as_user(admin).post(f'/api/accounts/users/{newcomer.id}/reject/').status_code == 204
    assert not User.objects.filter(pk=newcomer.pk).exists()


def test_a_teacher_with_a_journal_is_kept(as_user, admin, teacher, journal_class):
    client = as_user(admin)
    assert client.post(f'/api/accounts/users/{teacher.id}/block/').status_code == 200
    r = client.post(f'/api/accounts/users/{teacher.id}/reject/')
    assert r.status_code == 400 and 'jurnal sinflari' in str(r.data['detail'])
    assert User.objects.filter(pk=teacher.pk).exists()
    assert JournalClass.objects.filter(pk=journal_class.pk).exists()
    assert Student.objects.filter(journal_class=journal_class).count() == 3


def test_a_teacher_with_a_timetable_is_kept(as_user, admin, teacher):
    TimetableSlot.objects.create(teacher=teacher, day_index=0, period_index=1, maktab='Iftixor')
    r = as_user(admin).post(f'/api/accounts/users/{teacher.id}/reject/')
    assert r.status_code == 400 and 'jadval kataklari' in str(r.data['detail'])
    assert TimetableSlot.objects.filter(teacher=teacher).exists()
