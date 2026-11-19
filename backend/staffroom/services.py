"""A teacher's school day from the timetable: each hour's class and the
lesson they teach then — the calendar's week of the chorak, unless the
teacher picked another — with what they need for it (the lesson's file,
equipment sheet, poster, their readiness check)."""

import re
from datetime import date

from django.db.models import Max

from common.protected_media import protected_url
from common.subjects import main_subject
from journal.models import JournalClass
from learning.models import Attempt
from learning.readiness import PASS_PERCENT
from lessons.models import EquipmentSheet, Lesson
from lessons.visibility import visible_lessons
from schools.models import AcademicYear
from timetable.models import TimetableSlot

from .calendar import place
from .grades import class_grade, lesson_grade
from .models import PlannedLesson


def _norm(s: str) -> str:
    return re.sub(r"[\s\-–—_'.]", '', (s or '').lower())


def _match_class(classes, slot) -> JournalClass | None:
    """The teacher's journal class this hour is for: same name, the same
    school preferred when two schools have a 7-A."""
    name = _norm(slot.sinf)
    if not name:
        return None
    same = [c for c in classes if _norm(c.name) == name]
    if len(same) > 1 and slot.maktab:
        school = _norm(slot.maktab)
        by_school = [c for c in same if school in (_norm(c.school), _norm(c.partner_school.name if c.partner_school else ''))]
        same = by_school or same
    return same[0] if same else None


def _latest_file(model, grade, hafta):
    row = model.objects.filter(grade=grade, hafta=hafta).order_by('-created_at').first()
    return protected_url(row.image) if row else None


def lesson_card(lesson: Lesson, readiness: dict) -> dict:
    best = readiness.get(lesson.id)
    return {
        'id': lesson.id, 'title': lesson.title, 'grade': lesson.grade, 'chorak': lesson.chorak, 'hafta': lesson.hafta,
        'goal': (lesson.goal or '')[:400],
        'file': protected_url(lesson.file) if lesson.file else None,
        'file_url': lesson.file_url or None,
        'experiments': [{'name': e.name, 'minutes': e.minutes} for e in lesson.experiments.all()],
        'equipment_sheet': _latest_file(EquipmentSheet, lesson.grade, lesson.hafta),
        'poster': None,  # Ko'ragoniy has no lesson posters
        'readiness': {'best': best, 'passed': best is not None and best >= PASS_PERCENT},
    }


def day_plan(user, day: date) -> dict:
    weekday = day.weekday()
    slots = list(TimetableSlot.objects.filter(teacher=user, day_index=weekday).order_by('period_index')) \
        if weekday <= 4 else []
    where = place(day)

    planned = {p.period_index: p for p in PlannedLesson.objects.filter(teacher=user, date=day).select_related('lesson')}
    classes = list(JournalClass.objects.filter(teacher=user, year=AcademicYear.current()).select_related('partner_school'))

    # the class number read in the teacher's subject ("8-A" → '8-9' or 'F8')
    subject = main_subject(user)
    grades = {lesson_grade(class_grade(s.sinf), subject) for s in slots if not s.band} - {None}
    by_grade = {
        g: list(visible_lessons(Lesson.objects.filter(grade=g), user).order_by('chorak', 'hafta')
                .prefetch_related('experiments'))
        for g in grades
    }
    picked_ids = [p.lesson_id for p in planned.values() if p.lesson_id]
    extra = {lesson.id: lesson for lesson in visible_lessons(Lesson.objects.filter(id__in=picked_ids), user)
             .prefetch_related('experiments')}
    readiness = dict(
        Attempt.objects.filter(user=user, kind=Attempt.Kind.READINESS, submitted_at__isnull=False, lesson__isnull=False)
        .values('lesson').annotate(best=Max('percent')).values_list('lesson', 'best')
    )

    rows = []
    for s in slots:
        row = {
            'period': s.period_index, 'time_from': s.time_from, 'time_to': s.time_to, 'school': s.maktab,
            'room': s.xona, 'class_name': s.sinf, 'lesson_type': getattr(s, 'lesson_type', ''), 'band': s.band,
        }
        if s.band:
            rows.append(row)
            continue
        g = class_grade(s.sinf)
        lg = lesson_grade(g, subject)
        guess = None
        if lg is not None and where['chorak']:
            in_quarter = [lesson for lesson in by_grade[lg] if lesson.chorak == where['chorak']]
            if 0 < where['week'] <= len(in_quarter):
                guess = in_quarter[where['week'] - 1]
        p = planned.get(s.period_index)
        lesson = (extra.get(p.lesson_id) if p.lesson_id else None) if p else guess
        jc = _match_class(classes, s)
        row.update({
            'grade': g, 'lesson_grade': lg, 'picked': bool(p),
            'journal_class': {'id': jc.id, 'name': jc.name} if jc else None,
            'lesson': lesson_card(lesson, readiness) if lesson else None,
        })
        rows.append(row)
    return {
        'date': day, 'weekday': weekday, 'place': where, 'slots': rows,
        'options': {
            str(g): [{'id': x.id, 'title': x.title, 'chorak': x.chorak, 'hafta': x.hafta} for x in by_grade[g]]
            for g in grades
        },
    }
