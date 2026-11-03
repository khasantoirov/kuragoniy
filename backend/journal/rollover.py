"""Yangi o'quv yiliga o'tish — last year's classes go up one grade.

Each class of the year being closed gets a twin in the next year, one
grade up ("7-A" → "8-A", "10 B" → "11 B"), with the same teacher, school
and scale, and the same pupils as a fresh roster: the old journal keeps
every mark where it was, the new one starts empty. Pupils' platform
accounts move to the new class. An 11th grade graduates — no twin, its
pupils stay with their old class. A class whose name has no grade number
keeps its name.

Run twice, nothing doubles: a class that already has a twin
(JournalClass.rolled_from), or whose new name its teacher has already
made in the next year, is left alone.
"""

import re

from django.db import transaction

from .models import JournalClass, Student

TOP_GRADE = 11


def next_name(name: str):
    """(the class's name next year, graduates?)"""
    m = re.match(r'(\s*)(\d{1,2})(.*)', name or '', re.S)
    if not m:
        return name, False
    grade = int(m.group(2))
    if grade >= TOP_GRADE:
        return None, True
    return f'{m.group(1)}{grade + 1}{m.group(3)}', False


def plan(source, target=None):
    """What a rollover from `source` would do, class by class:
    'move' | 'graduate' | 'done' (already rolled) | 'exists' (the
    teacher has that class next year already)."""
    taken = set()
    if target is not None:
        taken = {(c.teacher_id, c.name.strip().lower()) for c in JournalClass.objects.filter(year=target)}
    rows = []
    classes = (JournalClass.objects.filter(year=source).select_related('teacher', 'partner_school')
               .prefetch_related('rolled_to').order_by('partner_school__name', 'name'))
    for c in classes:
        new_name, graduates = next_name(c.name)
        if graduates:
            action = 'graduate'
        elif any(t.year_id == getattr(target, 'id', None) for t in c.rolled_to.all()):
            action = 'done'
        elif (c.teacher_id, (new_name or '').strip().lower()) in taken:
            action = 'exists'
        else:
            action = 'move'
        rows.append({
            'id': c.id, 'name': c.name, 'new_name': new_name, 'action': action,
            'teacher': c.teacher.name, 'school': c.partner_school.name if c.partner_school_id else c.school,
            'students': c.students.filter(active=True).count(),
        })
    return rows


@transaction.atomic
def roll_over(source, target, exclude=()):
    from learning.models import StudentProfile
    from learning.student_accounts import grade_from_class_name

    exclude = {int(i) for i in exclude}
    made = pupils = 0
    for row in plan(source, target):
        if row['action'] != 'move' or row['id'] in exclude:
            continue
        old = JournalClass.objects.get(pk=row['id'])
        new = JournalClass.objects.create(
            teacher=old.teacher, school=old.school, partner_school=old.partner_school,
            name=row['new_name'], scale=old.scale, year=target, rolled_from=old,
        )
        made += 1
        for st in old.students.filter(active=True).order_by('order'):
            twin = Student.objects.create(journal_class=new, full_name=st.full_name, order=st.order)
            pupils += 1
            for profile in StudentProfile.objects.filter(roster_entry=st):
                profile.journal_class = new
                profile.roster_entry = twin
                profile.grade = grade_from_class_name(new.name) or profile.grade
                profile.save(update_fields=['journal_class', 'roster_entry', 'grade'])
    return {'classes': made, 'students': pupils}
