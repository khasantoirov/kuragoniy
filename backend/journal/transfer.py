"""Moving a pupil from one journal class to another, in one of two ways:

- carry: the pupil's row moves, with every mark, attendance entry,
  quarter grade and control-work mark. Each lands on the new class's
  lesson day of the same date — created there when the class had no
  lesson that day — and marks are carried over to the new class's
  scale (scales.convert keeps each one in its colour band).
- archive: the old row stays where it is, inactive and pointing at a
  fresh row in the new class (Student.moved_to); the old journal keeps
  showing it, greyed, and the new class starts the pupil with a clean
  slate.

Either way the pupil's platform account (StudentProfile) follows.
"""

from django.db import transaction
from django.db.models import Max

from .models import ClassDay, ControlWork, Student
from .scales import convert, level

MODES = ('carry', 'archive')


def _next_order(journal_class):
    return (journal_class.students.aggregate(m=Max('order'))['m'] or 0) + 1


def _follow(old_row, new_row, target):
    """The platform account (if any) goes with the pupil."""
    from learning.models import StudentProfile
    from learning.student_accounts import grade_from_class_name

    profile = StudentProfile.objects.filter(roster_entry=old_row).first()
    if profile:
        profile.journal_class = target
        profile.roster_entry = new_row
        profile.grade = grade_from_class_name(target.name) or profile.grade
        profile.save(update_fields=['journal_class', 'roster_entry', 'grade'])


@transaction.atomic
def transfer_student(student: Student, target, mode: str) -> Student:
    """Returns the pupil's row in `target`."""
    source = student.journal_class
    if mode == 'archive':
        new_row = Student.objects.create(journal_class=target, full_name=student.full_name, order=_next_order(target))
        student.active = False
        student.moved_to = new_row
        student.save(update_fields=['active', 'moved_to'])
        _follow(student, new_row, target)
        return new_row

    days: dict[int, ClassDay] = {}

    def day_for(day):
        if day.id not in days:
            days[day.id], _ = ClassDay.objects.get_or_create(
                journal_class=target, date=day.date, defaults={'chorak': day.chorak, 'period': day.period})
        return days[day.id]

    for g in student.grades.select_related('day'):
        g.day = day_for(g.day)
        g.mark = convert(g.mark, source.scale, target.scale)
        g.level = level(g.mark, target.scale)
        g.save(update_fields=['day', 'mark', 'level'])
    for a in student.attendance.select_related('day'):
        a.day = day_for(a.day)
        a.save(update_fields=['day'])
    for f in student.finals.all():
        f.mark = convert(f.mark, source.scale, target.scale)
        f.level = level(f.mark, target.scale)
        f.save(update_fields=['mark', 'level'])
    used: set[int] = set()  # one mark per work: two works never fold into one
    for cm in student.control_marks.select_related('work'):
        w = cm.work
        twin = (ControlWork.objects.filter(journal_class=target, date=w.date, chorak=w.chorak, title=w.title)
                .exclude(pk__in=used).first())
        cm.work = twin or ControlWork.objects.create(
            journal_class=target, date=w.date, chorak=w.chorak, title=w.title, created_by=w.created_by)
        used.add(cm.work.pk)
        cm.save(update_fields=['work'])  # control works are 0-100 everywhere

    student.journal_class = target
    student.order = _next_order(target)
    student.save(update_fields=['journal_class', 'order'])
    _follow(student, student, target)
    return student
