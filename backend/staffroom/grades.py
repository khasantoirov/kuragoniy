"""A class's grade ("7-A" → 7) and the lessons' grade it is taught from —
the one place that differs between platforms: Ko'ragoniy's lessons are
for grade groups ("1-2", "3-4", "5-6", "7", "8-9")."""

import re

from lessons.models import Lesson

_GRADE = re.compile(r'^\s*(\d{1,2})')


def class_grade(name: str) -> int | None:
    m = _GRADE.match(name or '')
    return int(m.group(1)) if m else None


def _span(value: str) -> tuple[int, int]:
    lo, _, hi = str(value).partition('-')
    return int(lo), int(hi or lo)


def lesson_grade(grade: int | None):
    """The Lesson.grade group a class of this grade learns from, or None."""
    if grade is None:
        return None
    for value in Lesson.Grade.values:
        lo, hi = _span(value)
        if lo <= grade <= hi:
            return value
    return None
