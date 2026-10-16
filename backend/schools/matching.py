"""Linking free-text school names (journal classes, timetable slots) to
partner School rows. Matching is on a normalised form so trivial
differences — case, stray spaces inside brackets, apostrophe variants —
don't split one school into several; anything beyond that is handled by
the school's explicit `aliases`."""

import re

from django.db import transaction

from journal.models import JournalClass
from timetable.models import TimetableSlot

from .models import School, SchoolTeacher


def norm(text) -> str:
    s = str(text or '').lower()
    s = re.sub(r"[ʻʼ‘’`´]", "'", s)
    s = re.sub(r'\s*([()])\s*', r'\1', s)
    return re.sub(r'\s+', ' ', s).strip()


def school_keys(school: School) -> set[str]:
    keys = {norm(school.name)}
    keys.update(norm(a) for a in (school.aliases or []) if str(a).strip())
    keys.discard('')
    return keys


def key_index(schools=None) -> dict[str, School]:
    index: dict[str, School] = {}
    for school in schools if schools is not None else School.objects.all():
        for key in school_keys(school):
            index.setdefault(key, school)
    return index


def find_school(text, index=None):
    if not str(text or '').strip():
        return None
    return (index if index is not None else key_index()).get(norm(text))


@transaction.atomic
def link_school(school: School) -> dict:
    """Attaches every not-yet-linked journal class whose free-text school
    matches `school` (name or alias), and records the teachers of those
    classes — and of matching timetable slots — as working there."""
    keys = school_keys(school)
    classes = [c for c in JournalClass.objects.filter(partner_school__isnull=True).exclude(school='') if norm(c.school) in keys]
    for c in classes:
        c.partner_school = school
    JournalClass.objects.bulk_update(classes, ['partner_school'])

    teacher_ids = {c.teacher_id for c in classes}
    teacher_ids |= {
        s.teacher_id for s in TimetableSlot.objects.exclude(maktab='').only('teacher_id', 'maktab') if norm(s.maktab) in keys
    }
    teacher_ids |= set(JournalClass.objects.filter(partner_school=school).values_list('teacher_id', flat=True))
    existing = set(SchoolTeacher.objects.filter(school=school).values_list('teacher_id', flat=True))
    SchoolTeacher.objects.bulk_create(
        [SchoolTeacher(school=school, teacher_id=t) for t in teacher_ids - existing], ignore_conflicts=True,
    )
    return {'classes': len(classes), 'teachers_added': len(teacher_ids - existing)}


def unlinked_names() -> list[dict]:
    """Free-text school names still not attached to any partner school,
    grouped by their normalised form, with where they're used."""
    index = key_index()
    groups: dict[str, dict] = {}

    def bucket(text):
        k = norm(text)
        g = groups.setdefault(k, {'key': k, 'variants': {}, 'classes': 0, 'slots': 0, 'teachers': set()})
        g['variants'][text] = g['variants'].get(text, 0) + 1
        return g

    for c in JournalClass.objects.filter(partner_school__isnull=True).exclude(school='').select_related('teacher'):
        g = bucket(c.school)
        g['classes'] += 1
        g['teachers'].add(c.teacher.name)
    for s in TimetableSlot.objects.exclude(maktab='').select_related('teacher'):
        if norm(s.maktab) in index:
            continue
        g = bucket(s.maktab)
        g['slots'] += 1
        g['teachers'].add(s.teacher.name)

    rows = []
    for g in groups.values():
        variants = sorted(g['variants'].items(), key=lambda kv: -kv[1])
        rows.append({
            'text': variants[0][0],
            'variants': [v for v, _ in variants],
            'classes': g['classes'],
            'slots': g['slots'],
            'teachers': sorted(g['teachers']),
        })
    rows.sort(key=lambda r: (-(r['classes'] * 10 + r['slots']), r['text'].lower()))
    return rows
