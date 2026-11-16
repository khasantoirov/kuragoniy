"""Puts each of this year's journal days in the chorak its date falls in by
the school calendar (Boshqaruv -> O'quv yillari -> Choraklar) - for days
added under the wrong chorak before the journal followed the calendar.
A day's marks and attendance hang off the day, so they move with it.
Dry run unless --apply."""

from django.core.management.base import BaseCommand
from django.db import transaction

from journal.models import ClassDay
from schools.models import AcademicYear
from staffroom.calendar import chorak_of


class Command(BaseCommand):
    help = "Re-file this year's journal days by the chorak calendar (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='write the changes')

    def handle(self, *args, apply=False, **options):
        by_date = {}
        moves = []
        days = ClassDay.objects.filter(journal_class__year=AcademicYear.current()).select_related('journal_class')
        for day in days.order_by('date', 'id'):
            want = by_date.setdefault(day.date, chorak_of(day.date))
            if day.chorak != want:
                moves.append((day, want))
        for day, want in moves:
            self.stdout.write(f'{day.date} {day.journal_class}: {day.chorak}-chorak -> {want}-chorak')
        if apply and moves:
            with transaction.atomic():
                for day, want in moves:
                    ClassDay.objects.filter(pk=day.pk).update(chorak=want)
        self.stdout.write(f"{len(moves)} day(s) {'moved' if apply else 'to move (dry run, nothing written)'}")
