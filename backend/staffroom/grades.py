"""A class's grade ("7-A" → 7) and the lessons' grade it is taught from —
the one place that differs between platforms: Ko'ragoniy's STEAM lessons
are for grade groups ("1-2", "3-4", "5-6", "7", "8-9"), its physics lessons
for single grades ("F7", "F8", "F9") — common/subjects.py."""

import re

from common.subjects import STEAM, grade_for_class

_GRADE = re.compile(r'^\s*(\d{1,2})')


def class_grade(name: str) -> int | None:
    m = _GRADE.match(name or '')
    return int(m.group(1)) if m else None


def lesson_grade(grade: int | None, subject: str = STEAM):
    """The Lesson.grade code a class of this grade learns from in `subject`, or None."""
    return grade_for_class(grade, subject)
