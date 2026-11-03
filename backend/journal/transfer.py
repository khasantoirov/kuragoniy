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

Every move is written down as a StudentTransfer with what it changed, so
undo_transfer can put it all back exactly (Ctrl+Z in the app).
"""

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from .models import AttendanceEntry, ClassDay, ControlMark, ControlWork, FinalGrade, GradeEntry, Student, StudentTransfer
from .scales import convert, level

MODES = ('carry', 'archive')


class UndoRefused(Exception):
    """The move can't be put back as it was; the message says why."""


def _next_order(journal_class):
    return (journal_class.students.aggregate(m=Max('order'))['m'] or 0) + 1


def _profiles(row):
    from learning.models import StudentProfile

    return list(StudentProfile.objects.filter(roster_entry=row))


def _follow(old_row, new_row, target):
    """The platform account (if any) goes with the pupil."""
    from learning.student_accounts import grade_from_class_name

    for profile in _profiles(old_row):
        profile.journal_class = target
        profile.roster_entry = new_row
        profile.grade = grade_from_class_name(target.name) or profile.grade
        profile.save(update_fields=['journal_class', 'roster_entry', 'grade'])


@transaction.atomic
def transfer_student(student: Student, target, mode: str, actor=None) -> StudentTransfer:
    """Moves the pupil; the record's student/new_row is their row in `target`."""
    source = student.journal_class
    state = {
        'order': student.order,
        'profiles': [[p.pk, p.journal_class_id, p.roster_entry_id, p.grade] for p in _profiles(student)],
    }
    if mode == 'archive':
        new_row = Student.objects.create(journal_class=target, full_name=student.full_name, order=_next_order(target))
        student.active = False
        student.moved_to = new_row
        student.save(update_fields=['active', 'moved_to'])
        _follow(student, new_row, target)
        return StudentTransfer.objects.create(student=student, new_row=new_row, source=source, target=target,
                                              mode=mode, state=state, actor=actor)

    state.update({
        'grades': [[g.pk, g.day_id, g.mark, g.level] for g in student.grades.all()],
        'attendance': [[a.pk, a.day_id] for a in student.attendance.all()],
        'finals': [[f.pk, f.mark, f.level] for f in student.finals.all()],
        'control_marks': [[c.pk, c.work_id] for c in student.control_marks.all()],
        'created_days': [], 'created_works': [],
    })
    days: dict[int, ClassDay] = {}

    def day_for(day):
        if day.id not in days:
            days[day.id], made = ClassDay.objects.get_or_create(
                journal_class=target, date=day.date, defaults={'chorak': day.chorak, 'period': day.period})
            if made:
                state['created_days'].append(days[day.id].id)
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
        if twin is None:
            twin = ControlWork.objects.create(journal_class=target, date=w.date, chorak=w.chorak, title=w.title,
                                              created_by=w.created_by)
            state['created_works'].append(twin.id)
        cm.work = twin
        used.add(twin.pk)
        cm.save(update_fields=['work'])  # control works are 0-100 everywhere

    student.journal_class = target
    student.order = _next_order(target)
    student.save(update_fields=['journal_class', 'order'])
    _follow(student, student, target)
    return StudentTransfer.objects.create(student=student, source=source, target=target, mode=mode, state=state, actor=actor)


def _restore_profiles(state):
    from learning.models import StudentProfile

    for pk, class_id, roster_id, grade in state.get('profiles', []):
        StudentProfile.objects.filter(pk=pk).update(journal_class_id=class_id, roster_entry_id=roster_id, grade=grade)


@transaction.atomic
def undo_transfer(record: StudentTransfer) -> Student:
    """Puts a move back as it was. Refused when the pupil has been given
    anything in the new class since — that would be lost or stranded."""
    if record.undone_at:
        raise UndoRefused("Bu ko'chirish allaqachon bekor qilingan.")
    state = record.state
    if record.mode == 'archive':
        new = record.new_row
        if new is not None:
            if new.grades.exists() or new.attendance.exists() or new.finals.exists() or new.control_marks.exists():
                raise UndoRefused(f"{record.target.name} sinfida o'quvchiga baho yoki davomat qo'yilgan — ko'chirishni bekor qilib bo'lmaydi.")
            if new.transfers.filter(undone_at__isnull=True).exists():
                raise UndoRefused("O'quvchi keyin yana ko'chirilgan — avval o'sha ko'chirishni bekor qiling.")
        old = record.student
        old.active, old.moved_to = True, None
        old.save(update_fields=['active', 'moved_to'])
        _restore_profiles(state)
        if new is not None:
            new.delete()
            record.new_row = None  # the database already let go of it (SET_NULL)
    else:
        st = record.student
        if st.journal_class_id != record.target_id or not st.active:
            raise UndoRefused("O'quvchi endi bu sinfda emas — ko'chirishni bekor qilib bo'lmaydi.")
        if st.transfers.filter(undone_at__isnull=True, created_at__gt=record.created_at).exists():
            raise UndoRefused("O'quvchi keyin yana ko'chirilgan — avval o'sha ko'chirishni bekor qiling.")
        grades = {pk: (day, mark, lvl) for pk, day, mark, lvl in state.get('grades', [])}
        att = {pk: day for pk, day in state.get('attendance', [])}
        finals = {pk: (mark, lvl) for pk, mark, lvl in state.get('finals', [])}
        cms = {pk: work for pk, work in state.get('control_marks', [])}
        days = {d for d, _m, _l in grades.values()} | set(att.values())
        if len(days) != ClassDay.objects.filter(pk__in=days).count() or len(set(cms.values())) != ControlWork.objects.filter(pk__in=set(cms.values())).count():
            raise UndoRefused(f"{record.source.name} sinfida o'sha dars kunlari yoki nazorat ishlari o'chirilgan — ko'chirishni bekor qilib bo'lmaydi.")
        newer = (st.grades.exclude(pk__in=grades).exists() or st.attendance.exclude(pk__in=att).exists()
                 or st.finals.exclude(pk__in=finals).exists() or st.control_marks.exclude(pk__in=cms).exists())
        if newer:
            raise UndoRefused(f"{record.target.name} sinfida o'quvchiga yangi baho yoki davomat qo'yilgan — ko'chirishni bekor qilib bo'lmaydi.")
        for pk, (day, mark, lvl) in grades.items():
            GradeEntry.objects.filter(pk=pk, student=st).update(day_id=day, mark=mark, level=lvl)
        for pk, day in att.items():
            AttendanceEntry.objects.filter(pk=pk, student=st).update(day_id=day)
        for pk, (mark, lvl) in finals.items():
            FinalGrade.objects.filter(pk=pk, student=st).update(mark=mark, level=lvl)
        for pk, work in cms.items():
            ControlMark.objects.filter(pk=pk, student=st).update(work_id=work)
        Student.objects.filter(pk=st.pk).update(journal_class_id=record.source_id, order=state.get('order', st.order))
        _restore_profiles(state)
        # what the move had to create in the new class goes, if it's still empty
        for d in ClassDay.objects.filter(pk__in=state.get('created_days', []), journal_class_id=record.target_id):
            if not d.grades.exists() and not d.attendance.exists():
                d.delete()
        for w in ControlWork.objects.filter(pk__in=state.get('created_works', []), journal_class_id=record.target_id):
            if not w.marks.exists():
                w.delete()
    record.undone_at = timezone.now()
    record.save(update_fields=['undone_at'])
    record.student.refresh_from_db()
    return record.student
