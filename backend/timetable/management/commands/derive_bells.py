"""Fills in each school's lesson times (SchoolBells, timetable/bells.py)
from the times its lessons already carry in the timetable, so nobody has to
type them in again:

    manage.py derive_bells            # report only
    manage.py derive_bells --apply    # write

For each school and soat, the time most of its one-soat lessons have from
Monday to Thursday becomes the every-day time; Friday gets its own only
where its lessons say otherwise. A soat known only from a Friday lesson
counts for every day. Schools that already have their times are left as
they are (a teacher entered them), and so is a school whose lessons don't
add up (soats overlapping) — the report lists it. Every lesson's time is
then re-set from the result, which for consistent data changes none; the
report says how many would change before anything is written.
"""

from collections import Counter, defaultdict

from django.core.management.base import BaseCommand
from django.db import transaction
from rest_framework.exceptions import ValidationError

from schools.models import School
from timetable.bells import apply_to_slots, clean_times, lesson_times
from timetable.models import SchoolBells, TimetableSlot

FRIDAY = 4


def _hm(t) -> str:
    return t.strftime('%H:%M')


def derive() -> dict[int, dict]:
    """{school id: times} from the timetable's one-soat lessons."""
    seen: dict = defaultdict(lambda: defaultdict(lambda: {'week': Counter(), 'fri': Counter()}))
    slots = (TimetableSlot.objects.filter(band=False, school__isnull=False, span__lte=1)
             .exclude(time_from__isnull=True).exclude(time_to__isnull=True))
    for s in slots:
        pair = (_hm(s.time_from), _hm(s.time_to))
        seen[s.school_id][s.period_index]['fri' if s.day_index == FRIDAY else 'week'][pair] += 1
    out: dict = {}
    for school_id, periods in seen.items():
        every: dict = {}
        friday: dict = {}
        for p, c in periods.items():
            week = c['week'].most_common(1)[0][0] if c['week'] else None
            fri = c['fri'].most_common(1)[0][0] if c['fri'] else None
            every[str(p)] = list(week or fri)
            if week and fri and fri != week:
                friday[str(p)] = list(fri)
        times = {'*': every}
        if friday:
            times[str(FRIDAY)] = friday
        out[school_id] = times
    return out


def _would_change(school_id: int, times: dict) -> int:
    probe = SchoolBells(school_id=school_id, times=times)
    n = 0
    for s in TimetableSlot.objects.filter(school_id=school_id, band=False):
        t = lesson_times(probe, s.day_index, s.period_index, s.span)
        if t and (s.time_from, s.time_to) != t:
            n += 1
    return n


class Command(BaseCommand):
    help = "Maktablarning dars vaqtlarini jadvaldagi mavjud darslar vaqtidan to'ldiradi"

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help="yozish (busiz faqat hisobot)")

    def handle(self, *args, apply=False, **options):
        names = dict(School.objects.values_list('id', 'name'))
        have = set(SchoolBells.objects.values_list('school_id', flat=True))
        plan: list[tuple[int, dict]] = []
        for school_id, raw in sorted(derive().items(), key=lambda kv: names.get(kv[0], '')):
            name = names.get(school_id, school_id)
            if school_id in have:
                self.stdout.write(f'= {name}: dars vaqtlari allaqachon kiritilgan — tegilmaydi')
                continue
            try:
                times = clean_times(raw)
            except ValidationError as exc:
                self.stdout.write(f'! {name}: darslar vaqti bir-biriga to\'g\'ri kelmaydi — o\'tkazib yuborildi ({exc.detail})')
                continue
            periods = ', '.join(f"{p}-soat {a}–{b}" for p, (a, b) in times['*'].items())
            fri = times.get(str(FRIDAY))
            self.stdout.write(f'+ {name}: {periods}')
            if fri:
                self.stdout.write('    juma: ' + ', '.join(f"{p}-soat {a}–{b}" for p, (a, b) in fri.items()))
            self.stdout.write(f'    vaqti o\'zgaradigan darslar: {_would_change(school_id, times)}')
            plan.append((school_id, times))

        if not apply:
            self.stdout.write(f'\nHisobot: {len(plan)} ta maktab. Yozish uchun --apply bilan qayta ishga tushiring.')
            return
        changed = 0
        with transaction.atomic():
            for school_id, times in plan:
                bells = SchoolBells.objects.create(school_id=school_id, times=times)
                changed += apply_to_slots(bells)
        self.stdout.write(f'\nYozildi: {len(plan)} ta maktabning dars vaqtlari; vaqti o\'zgargan darslar: {changed}.')
