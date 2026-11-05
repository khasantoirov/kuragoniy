"""Moving a teacher between partner schools.

A teacher belongs to a school in two ways: the assignment (SchoolTeacher)
and the journal classes / timetable lessons they teach there. A move does
both at once:

  * the teacher's classes at the old school — this o'quv yili's and coming
    ones; a past year's stay as history — go to the successor, with their
    rosters, marks and pupils' accounts (the class itself never changes
    school: its pupils are still there);
  * their timetable lessons at that school go to the successor too, where
    the successor is free at that hour (the rest stay and are reported);
  * the assignment to the old school ends, the new school's begins.

A teacher with classes at the old school can't leave it without a
successor — the classes would have no one. TeacherMove.state keeps what
changed, and undo_move() puts it back while nothing has moved on since.
"""

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from journal.models import JournalClass
from timetable.models import TimetableSlot

from .matching import norm, school_keys
from .models import AcademicYear, SchoolTeacher, TeacherMove


class UndoRefused(Exception):
    """The move can't be put back as it was; the message says why."""


def classes_at(teacher, school):
    """The teacher's classes at `school` in this and coming o'quv yillari."""
    current = AcademicYear.current()
    return JournalClass.objects.filter(teacher=teacher, partner_school=school, year__start_year__gte=current.start_year)


def slots_at(teacher, school):
    keys = school_keys(school)
    return [s for s in TimetableSlot.objects.filter(teacher=teacher).exclude(maktab='') if norm(s.maktab) in keys]


def preview(teacher, school) -> dict:
    return {
        'classes': [{'id': c.id, 'name': c.name} for c in classes_at(teacher, school).order_by('name')],
        'slots': len(slots_at(teacher, school)),
        'assigned': SchoolTeacher.objects.filter(school=school, teacher=teacher).exists(),
    }


def _since(member):
    return member.since.isoformat() if member and member.since else None


@transaction.atomic
def move_teacher(teacher, from_school, *, to_school=None, successor=None, since=None, actor=None) -> TeacherMove:
    if to_school is not None and to_school.pk == from_school.pk:
        raise ValidationError({'to_school': "Yangi maktab hozirgisidan boshqa bo'lsin."})
    if successor is not None and successor.pk == teacher.pk:
        raise ValidationError({'successor': "O'rniga boshqa o'qituvchini tanlang."})
    if to_school is None and successor is None:
        raise ValidationError({'detail': "Yangi maktabni yoki o'rniga keladigan o'qituvchini tanlang."})
    classes = list(classes_at(teacher, from_school))
    if classes and successor is None:
        raise ValidationError({'successor': f"Bu o'qituvchining shu maktabda {len(classes)} ta sinfi bor — "
                                            "ularni kimga topshirishni tanlang."})

    member = SchoolTeacher.objects.filter(school=from_school, teacher=teacher).first()
    if member is None and not classes:
        raise ValidationError({'teacher': "Bu o'qituvchi shu maktabga biriktirilmagan."})
    successor_was_member = bool(successor) and SchoolTeacher.objects.filter(school=from_school, teacher=successor).exists()
    target_member = SchoolTeacher.objects.filter(school=to_school, teacher=teacher).first() if to_school else None

    state = {
        'classes': [c.id for c in classes],
        'slots_moved': [],
        'slots_kept': [],
        'was_member': member is not None,
        'member_since': _since(member),
        'successor_was_member': successor_was_member,
        'target_was_member': target_member is not None,
    }

    if successor is not None:
        # first, so the class signal (schools/signals.py) finds it with its date
        SchoolTeacher.objects.get_or_create(school=from_school, teacher=successor, defaults={'since': since})
        for c in classes:
            c.teacher = successor
            c.save(update_fields=['teacher'])  # schools/signals.py records the successor at the school
        busy = set(TimetableSlot.objects.filter(teacher=successor).values_list('day_index', 'period_index'))
        for slot in slots_at(teacher, from_school):
            if (slot.day_index, slot.period_index) in busy:
                state['slots_kept'].append(slot.id)
                continue
            slot.teacher = successor
            slot.save(update_fields=['teacher'])
            busy.add((slot.day_index, slot.period_index))
            state['slots_moved'].append(slot.id)

    SchoolTeacher.objects.filter(school=from_school, teacher=teacher).delete()
    if to_school is not None and target_member is None:
        SchoolTeacher.objects.create(school=to_school, teacher=teacher, since=since)

    return TeacherMove.objects.create(teacher=teacher, from_school=from_school, to_school=to_school,
                                      successor=successor, state=state, actor=actor)


@transaction.atomic
def undo_move(record: TeacherMove) -> None:
    if record.undone_at:
        raise UndoRefused("Bu ko'chirish allaqachon bekor qilingan.")
    later = TeacherMove.objects.filter(teacher=record.teacher, created_at__gt=record.created_at, undone_at__isnull=True)
    if later.exists():
        raise UndoRefused("Bu o'qituvchi keyin yana ko'chirilgan — avval o'shani bekor qiling.")
    s = record.state
    teacher, successor, school = record.teacher, record.successor, record.from_school

    if s['classes']:
        if successor is None:
            raise UndoRefused("Sinflarni olgan o'qituvchi endi yo'q.")
        moved = JournalClass.objects.filter(pk__in=s['classes'])
        if moved.count() != len(s['classes']) or moved.exclude(teacher=successor).exists():
            raise UndoRefused("Sinflardan biri keyin boshqa o'qituvchiga o'tgan yoki o'chirilgan.")
    slots = list(TimetableSlot.objects.filter(pk__in=s['slots_moved']))
    if any(slot.teacher_id != getattr(successor, 'pk', None) for slot in slots):
        raise UndoRefused("Dars jadvali keyin o'zgargan.")
    busy = set(TimetableSlot.objects.filter(teacher=teacher).values_list('day_index', 'period_index'))
    if any((slot.day_index, slot.period_index) in busy for slot in slots):
        raise UndoRefused("O'qituvchining jadvalida o'sha soatlarga yangi dars qo'shilgan.")

    for c in JournalClass.objects.filter(pk__in=s['classes']):
        c.teacher = teacher
        c.save(update_fields=['teacher'])
    for slot in slots:
        slot.teacher = teacher
        slot.save(update_fields=['teacher'])

    if s['was_member']:
        SchoolTeacher.objects.update_or_create(school=school, teacher=teacher, defaults={'since': s['member_since']})
    elif not classes_at(teacher, school).exists():
        SchoolTeacher.objects.filter(school=school, teacher=teacher).delete()
    if successor is not None and not s['successor_was_member'] and not classes_at(successor, school).exists():
        SchoolTeacher.objects.filter(school=school, teacher=successor).delete()
    if record.to_school_id and not s['target_was_member'] and not classes_at(teacher, record.to_school).exists():
        SchoolTeacher.objects.filter(school=record.to_school, teacher=teacher).delete()

    record.undone_at = timezone.now()
    record.save(update_fields=['undone_at'])
