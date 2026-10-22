"""Journal-based statistics per class, teacher and partner school.

Definitions (shown to users as written here):
  Marks are taken by their colour band on a 0-5 footing (GradeEntry.level,
  journal/scales.py), so classes graded 0-5, 0-10 and 0-100 pool together.
  O'rtacha baho  — mean of all marks in the period.
  O'zlashtirish  — share of graded students whose average mark is >= 3.5
                   (rounds to "4" or "5").
  Davomat        — 1 - (sababli + sababsiz absences) / (students x lesson
                   days). Late ("kech") is counted separately, not as an
                   absence.
  Sifat          — marks and attendance together: the mean of
                   O'zlashtirish and Davomat.

Everything is computed with a handful of grouped queries and pooled from
raw sums, so a school's figure is the true figure over all its pupils, not
an average of class averages.
"""

from collections import defaultdict
from datetime import timedelta

from django.db.models import Avg, Count, Q, Sum

from journal.models import AttendanceEntry, ClassDay, GradeEntry, JournalClass, Student
from learning.models import Attempt, StudentProfile

PASS_AVG = 2.5
QUALITY_AVG = 3.5
ATTENTION_AVG = 2.5
ATTENTION_ABSENCES = 3

RAW_KEYS = (
    'students', 'days', 'marks_n', 'marks_sum', 'graded', 'passing', 'quality',
    'abs_s', 'abs_n', 'late', 'student_days', 'accounts', 'attempts_n', 'attempts_pct_sum',
)


def _day_filter(chorak, prefix=''):
    return Q(**{f'{prefix}chorak': chorak}) if chorak else Q()


def class_raw(classes, chorak=None) -> dict[int, dict]:
    """Raw, poolable sums per class id."""
    ids = [c.id for c in classes]
    raw = {i: dict.fromkeys(RAW_KEYS, 0) for i in ids}
    if not ids:
        return raw

    for r in Student.objects.filter(journal_class_id__in=ids, active=True).values('journal_class').annotate(n=Count('id')):
        raw[r['journal_class']]['students'] = r['n']
    for r in (ClassDay.objects.filter(Q(journal_class_id__in=ids) & _day_filter(chorak))
              .values('journal_class').annotate(n=Count('id'))):
        raw[r['journal_class']]['days'] = r['n']

    marks = (GradeEntry.objects.filter(Q(day__journal_class_id__in=ids, student__active=True) & _day_filter(chorak, 'day__'))
             .values('student', 'day__journal_class').annotate(n=Count('id'), s=Sum('level')))
    for r in marks:
        row = raw[r['day__journal_class']]
        avg = r['s'] / r['n']
        row['marks_n'] += r['n']
        row['marks_sum'] += r['s']
        row['graded'] += 1
        row['passing'] += avg >= PASS_AVG
        row['quality'] += avg >= QUALITY_AVG

    att = (AttendanceEntry.objects.filter(Q(day__journal_class_id__in=ids, student__active=True) & _day_filter(chorak, 'day__'))
           .values('day__journal_class', 'status').annotate(n=Count('id')))
    for r in att:
        # 'x' (kirmadi: at school, skipped the lesson) is an unexcused absence.
        key = {'s': 'abs_s', 'n': 'abs_n', 'x': 'abs_n', 'k': 'late'}.get(r['status'])
        if key:
            raw[r['day__journal_class']][key] += r['n']

    for i in ids:
        raw[i]['student_days'] = raw[i]['students'] * raw[i]['days']

    for r in StudentProfile.objects.filter(journal_class_id__in=ids, user__approved=True).values('journal_class').annotate(n=Count('id')):
        raw[r['journal_class']]['accounts'] = r['n']
    for r in (Attempt.objects.filter(user__student_profile__journal_class_id__in=ids, submitted_at__isnull=False,
                                     kind__in=[Attempt.Kind.HOMEWORK, Attempt.Kind.PRACTICE])
              .values('user__student_profile__journal_class').annotate(n=Count('id'), s=Sum('percent'))):
        raw[r['user__student_profile__journal_class']]['attempts_n'] = r['n']
        raw[r['user__student_profile__journal_class']]['attempts_pct_sum'] = r['s'] or 0
    return raw


def pool(rows) -> dict:
    out = dict.fromkeys(RAW_KEYS, 0)
    for r in rows:
        for k in RAW_KEYS:
            out[k] += r[k]
    return out


def derive(raw: dict) -> dict:
    """Human-facing metrics from pooled raw sums (None = no data yet)."""
    def pct(a, b):
        return round(100 * a / b, 1) if b else None

    absences = raw['abs_s'] + raw['abs_n']
    mastery = pct(raw['quality'], raw['graded'])
    attendance = round(100 - 100 * absences / raw['student_days'], 1) if raw['student_days'] else None
    quality = (round((mastery + attendance) / 2 + 1e-9, 1)
               if mastery is not None and attendance is not None else None)
    return {
        'students': raw['students'],
        'days': raw['days'],
        'marks': raw['marks_n'],
        'avg_mark': round(raw['marks_sum'] / raw['marks_n'], 2) if raw['marks_n'] else None,
        'uzlashtirish': mastery,
        'sifat': quality,
        'attendance': attendance,
        'abs_s': raw['abs_s'],
        'abs_n': raw['abs_n'],
        'late': raw['late'],
        'accounts': raw['accounts'],
        'platform_avg': round(raw['attempts_pct_sum'] / raw['attempts_n'], 1) if raw['attempts_n'] else None,
    }


def class_rows(classes, chorak=None) -> list[dict]:
    raw = class_raw(classes, chorak)
    return [
        {
            'class_id': c.id, 'name': c.name, 'school_text': c.school,
            'school_id': c.partner_school_id, 'school': c.partner_school.name if c.partner_school_id else '',
            'teacher_id': c.teacher_id, 'teacher': c.teacher.name,
            **derive(raw[c.id]),
        }
        for c in classes
    ]


def grouped(classes, chorak, key, label) -> list[dict]:
    """Pools class figures by `key(class)` (teacher, school, ...)."""
    raw = class_raw(classes, chorak)
    buckets: dict = defaultdict(list)
    names: dict = {}
    class_count: dict = defaultdict(int)
    for c in classes:
        k = key(c)
        buckets[k].append(raw[c.id])
        names[k] = label(c)
        class_count[k] += 1
    return [{'id': k, 'name': names[k], 'classes': class_count[k], **derive(pool(rows))} for k, rows in buckets.items()]


PERIODS = ('week', 'month', 'quarter', 'year')


def _academic_year(d):
    """The school year a date belongs to, by its starting calendar year
    (September–August)."""
    return d.year if d.month >= 9 else d.year - 1


def _bucket(d, chorak, period):
    """(sort key, academic year) of the bucket a lesson day falls into."""
    if period == 'week':
        start = d - timedelta(days=d.weekday())
        return start.isoformat(), _academic_year(d)
    if period == 'quarter':
        ay = _academic_year(d)
        return f'{ay}-{chorak}', ay
    if period == 'year':
        ay = _academic_year(d)
        return str(ay), ay
    return f'{d:%Y-%m}', _academic_year(d)


def _label(key, period, many_years):
    if period == 'week':
        y, m, dd = key.split('-')
        return f'{dd}.{m}'
    if period == 'quarter':
        ay, ch = key.split('-')
        ay = int(ay)
        return f'{ch}-chorak {ay % 100:02d}/{(ay + 1) % 100:02d}' if many_years else f'{ch}-chorak'
    if period == 'year':
        ay = int(key)
        return f'{ay}–{(ay + 1) % 100:02d}'
    y, m = key.split('-')
    return f'{m}.{y[2:]}'


def trend(classes, chorak=None, period='month') -> list[dict]:
    """Average mark and attendance per week, month, school quarter
    (chorak) or school year. Lesson-day sums are fetched once and bucketed
    here, so every grouping uses the same definitions as the tables."""
    period = period if period in PERIODS else 'month'
    ids = [c.id for c in classes]
    if not ids:
        return []
    marks: dict = defaultdict(lambda: [0, 0])
    years: dict = {}
    for r in (GradeEntry.objects.filter(Q(day__journal_class_id__in=ids, student__active=True) & _day_filter(chorak, 'day__'))
              .values('day__date', 'day__chorak').annotate(s=Sum('level'), n=Count('id'))):
        k, ay = _bucket(r['day__date'], r['day__chorak'], period)
        marks[k][0] += r['s']
        marks[k][1] += r['n']
        years[k] = ay
    roster = dict(Student.objects.filter(journal_class_id__in=ids, active=True).values('journal_class')
                  .annotate(n=Count('id')).values_list('journal_class', 'n'))
    student_days: dict = defaultdict(int)
    for r in (ClassDay.objects.filter(Q(journal_class_id__in=ids) & _day_filter(chorak))
              .values('date', 'chorak', 'journal_class').annotate(n=Count('id'))):
        k, ay = _bucket(r['date'], r['chorak'], period)
        student_days[k] += r['n'] * roster.get(r['journal_class'], 0)
        years[k] = ay
    absences: dict = defaultdict(int)
    for r in (AttendanceEntry.objects.filter(
            Q(day__journal_class_id__in=ids, student__active=True, status__in=['s', 'n', 'x']) & _day_filter(chorak, 'day__'))
              .values('day__date', 'day__chorak').annotate(n=Count('id'))):
        absences[_bucket(r['day__date'], r['day__chorak'], period)[0]] += r['n']
    many_years = len(set(years.values())) > 1
    out = []
    for k in sorted(set(marks) | set(student_days)):
        s_, n = marks.get(k, (0, 0))
        row = {
            'key': k,
            'label': _label(k, period, many_years),
            'avg_mark': round(s_ / n, 2) if n else None,
            'marks': n,
            'attendance': round(100 - 100 * absences.get(k, 0) / student_days[k], 1) if student_days.get(k) else None,
        }
        if period == 'month':
            row['month'] = k
        out.append(row)
    return out


def monthly_trend(classes, chorak=None) -> list[dict]:
    return trend(classes, chorak, 'month')


def composition(classes, chorak=None) -> dict:
    """What the pie charts show: how many of each mark, and how the
    expected lesson attendances split into on time / late / excused /
    unexcused."""
    ids = [c.id for c in classes]
    marks = {str(m): 0 for m in (5, 4, 3, 2, 1)}
    att = {'present': 0, 'late': 0, 'excused': 0, 'unexcused': 0}
    if not ids:
        return {'marks': marks, 'attendance': att}
    for r in (GradeEntry.objects.filter(Q(day__journal_class_id__in=ids, student__active=True) & _day_filter(chorak, 'day__'))
              .values('level').annotate(n=Count('id'))):
        marks[str(r['level'])] = r['n']
    raw = pool(class_raw(classes, chorak).values())
    att['late'], att['excused'], att['unexcused'] = raw['late'], raw['abs_s'], raw['abs_n']
    att['present'] = max(0, raw['student_days'] - raw['abs_s'] - raw['abs_n'] - raw['late'])
    return {'marks': marks, 'attendance': att}


def attention(classes, chorak=None, limit=100) -> list[dict]:
    """Pupils who need a closer look: average below "3" or several
    unexcused absences in the period."""
    ids = [c.id for c in classes]
    if not ids:
        return []
    by_class = {c.id: c for c in classes}
    marks = {
        r['student']: r for r in GradeEntry.objects.filter(Q(day__journal_class_id__in=ids, student__active=True) & _day_filter(chorak, 'day__'))
        .values('student').annotate(avg=Avg('level'), n=Count('id'))
    }
    absn = {
        r['student']: r['n'] for r in AttendanceEntry.objects.filter(
            Q(day__journal_class_id__in=ids, student__active=True, status__in=['n', 'x']) & _day_filter(chorak, 'day__'))
        .values('student').annotate(n=Count('id'))
    }
    flagged = {s for s, r in marks.items() if r['avg'] < ATTENTION_AVG} | {s for s, n in absn.items() if n >= ATTENTION_ABSENCES}
    rows = []
    for st in Student.objects.filter(id__in=flagged).select_related('journal_class'):
        c = by_class.get(st.journal_class_id)
        if not c:
            continue
        m = marks.get(st.id)
        rows.append({
            'student_id': st.id, 'name': st.full_name, 'class_id': c.id, 'class_name': c.name,
            'teacher': c.teacher.name, 'school': c.partner_school.name if c.partner_school_id else c.school,
            'avg_mark': round(m['avg'], 2) if m else None, 'marks': m['n'] if m else 0,
            'unexcused': absn.get(st.id, 0),
            'reasons': [r for r, ok in (('low_mark', bool(m and m['avg'] < ATTENTION_AVG)),
                                        ('absences', absn.get(st.id, 0) >= ATTENTION_ABSENCES)) if ok],
        })
    rows.sort(key=lambda r: ((r['avg_mark'] if r['avg_mark'] is not None else 5), -r['unexcused']))
    return rows[:limit]


def classes_for(viewer, *, school_id=None, teacher_id=None):
    qs = JournalClass.objects.select_related('teacher', 'partner_school')
    if not viewer.is_oversight:
        qs = qs.filter(teacher=viewer)
    elif teacher_id:
        qs = qs.filter(teacher_id=teacher_id)
    if school_id == 'none':
        qs = qs.filter(partner_school__isnull=True)
    elif school_id:
        qs = qs.filter(partner_school_id=school_id)
    return list(qs.order_by('partner_school__name', 'teacher__name', 'name'))
