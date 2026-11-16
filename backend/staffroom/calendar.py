"""The school calendar: which chorak a day falls in and which of its weeks.

The administration sets each o'quv yili's chorak dates (Boshqaruv → O'quv
yillari); until it does, the usual dates are assumed — close to the
ministry's calendar, but they move a little every year, hence `exact`.
"""

from datetime import date, timedelta

from schools.models import AcademicYear, school_year_of


def usual_quarters(start_year: int) -> list[tuple[date, date]]:
    y, n = start_year, start_year + 1
    return [
        (date(y, 9, 2), date(y, 11, 3)),
        (date(y, 11, 10), date(y, 12, 27)),
        (date(n, 1, 11), date(n, 3, 20)),
        (date(n, 3, 28), date(n, 5, 24)),
    ]


def parse_quarters(raw) -> list[tuple[date, date]] | None:
    """Stored [{"start","end"}]×4 → date pairs; None when unset/invalid."""
    if not isinstance(raw, list) or len(raw) != 4:
        return None
    try:
        out = [(date.fromisoformat(q['start']), date.fromisoformat(q['end'])) for q in raw]
    except (KeyError, TypeError, ValueError):
        return None
    return out


def validate_quarters(raw) -> list[dict]:
    """The admin's input, checked: four ranges, each in order, one after
    another. Raises ValueError with the reason."""
    pairs = parse_quarters(raw)
    if pairs is None:
        raise ValueError("To'rtta chorakning boshlanish va tugash sanasini kiriting.")
    for i, (a, b) in enumerate(pairs):
        if b < a:
            raise ValueError(f"{i + 1}-chorak tugashi boshlanishidan oldin bo'lmasin.")
        if i and a <= pairs[i - 1][1]:
            raise ValueError(f"{i + 1}-chorak {i}-chorak tugaganidan keyin boshlansin.")
    return [{'start': a.isoformat(), 'end': b.isoformat()} for a, b in pairs]


def quarters_of(year: AcademicYear) -> tuple[list[tuple[date, date]], bool]:
    """(the year's chorak dates, whether the administration set them)."""
    stored = parse_quarters(year.quarters)
    return (stored, True) if stored else (usual_quarters(year.start_year), False)


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _first_week(start: date) -> date:
    """The Monday of a chorak's first school week: a chorak that starts on
    a Saturday or Sunday (after the holidays) begins with the next week."""
    while start.weekday() > 4:
        start += timedelta(days=1)
    return _monday(start)


def place(day: date) -> dict:
    """{chorak, week (1-based within the chorak), exact} — chorak None in
    the holidays between choraks or outside the school year."""
    year = AcademicYear.objects.filter(start_year=school_year_of(day)).first()
    quarters, exact = quarters_of(year) if year else (usual_quarters(school_year_of(day)), False)
    for i, (a, b) in enumerate(quarters):
        if a <= day <= b:
            return {'chorak': i + 1, 'week': max(1, (_monday(day) - _first_week(a)).days // 7 + 1), 'exact': exact}
    return {'chorak': None, 'week': None, 'exact': exact}


def chorak_of(day: date) -> int:
    """The chorak a journal day is filed under: the one its date falls in;
    in the holidays, the one that has just ended (a make-up lesson); before
    the first chorak, the first; after the last, the last."""
    year = AcademicYear.objects.filter(start_year=school_year_of(day)).first()
    quarters, _ = quarters_of(year) if year else (usual_quarters(school_year_of(day)), False)
    n = 1
    for i, (start, _end) in enumerate(quarters):
        if day >= start:
            n = i + 1
    return n


def next_school_day(day: date) -> date:
    """The next Monday–Friday after `day`."""
    d = day + timedelta(days=1)
    while d.weekday() > 4:
        d += timedelta(days=1)
    return d
