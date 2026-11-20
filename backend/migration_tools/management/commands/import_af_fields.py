"""Fills in, for the Amaliy fizika lessons import_af already copied, the
fields Ko'ragoniy Edu didn't have then: the lesson's bo'lim (cat), its
virtual-lab link (sim_id) and each experiment's type (Oddiy / WOW / O'yin).
Reads amaliyfizika.uz's SQLite database read-only; nothing there changes.

    manage.py import_af_fields --source /tmp/af.sqlite3           # report only
    manage.py import_af_fields --source /tmp/af.sqlite3 --apply   # write

Only what is still unset here is written: a lesson whose cat or sim_id
someone has already filled in here keeps it, and an experiment is matched
by its name inside the same lesson (an experiment renamed or added here
since the copy is left as it is, and listed).
"""

import sqlite3
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from lessons.models import Experiment, Lesson
from lessons.signals import send_lessons_backup, suppress_lessons_backup
from migration_tools.models import ImportedRow

SOURCE = 'af'


class Command(BaseCommand):
    help = "amaliyfizika.uz'dan ko'chirilgan darslarga bo'lim, simulyatsiya va tajriba turini to'ldiradi"

    def add_arguments(self, parser):
        parser.add_argument('--source', required=True, help="amaliyfizika.uz bazasining nusxasi (sqlite3)")
        parser.add_argument('--apply', action='store_true', help="yozish (bo'lmasa faqat hisobot)")

    def handle(self, *args, source, apply, **opts):
        if not Path(source).is_file():
            raise CommandError(f'Baza topilmadi: {source}')
        src = sqlite3.connect(f'file:{Path(source).as_posix()}?mode=ro', uri=True)
        src.row_factory = sqlite3.Row
        out = self.stdout.write

        mapped = dict(ImportedRow.objects.filter(source=SOURCE, table='lessons_lesson')
                      .values_list('source_id', 'target_id'))
        here = Lesson.objects.in_bulk([int(t) for t in mapped.values()])
        valid_cats = {c for c, _ in Lesson.Category.choices}
        valid_types = {c for c, _ in Experiment.Type.choices}

        lesson_updates, exp_updates, unmatched, gone = [], [], [], 0
        for r in src.execute('select id, cat, sim_id from lessons_lesson order by id'):
            target = mapped.get(str(r['id']))
            lesson = here.get(int(target)) if target else None
            if lesson is None:
                gone += 1 if target else 0
                continue
            change = {}
            if not lesson.cat and r['cat'] in valid_cats:
                change['cat'] = r['cat']
            if not lesson.sim_id and r['sim_id']:
                change['sim_id'] = r['sim_id']
            if change:
                lesson_updates.append((lesson, change))

            # experiments: matched by name inside the lesson, in order
            mine = list(lesson.experiments.order_by('order', 'id'))
            used = set()
            for e in src.execute('select name, type from lessons_experiment where lesson_id = ? order by "order", id',
                                 (r['id'],)):
                hit = next((x for x in mine if x.pk not in used and x.name.strip() == (e['name'] or '').strip()), None)
                if hit is None:
                    unmatched.append(f"{lesson.title}: {e['name']}")
                    continue
                used.add(hit.pk)
                if e['type'] in valid_types and e['type'] != hit.type and hit.type == Experiment.Type.ODDIY:
                    exp_updates.append((hit, e['type']))

        cats = {}
        for _, ch in lesson_updates:
            if 'cat' in ch:
                cats[ch['cat']] = cats.get(ch['cat'], 0) + 1
        types = {}
        for _, ty in exp_updates:
            types[ty] = types.get(ty, 0) + 1
        out(f"Darslar: {len(lesson_updates)} tasiga yoziladi — bo'limlar {cats}, "
            f"simulyatsiya havolasi {sum(1 for _, ch in lesson_updates if 'sim_id' in ch)} ta")
        out(f"Tajribalar: {len(exp_updates)} tasining turi o'zgaradi {types} (qolganlari 'Oddiy' bo'lib qoladi)")
        if gone:
            out(f"  - bu yerda o'chirilgan darslar: {gone}")
        for u in unmatched[:20]:
            out(f"  ? topilmadi (nomi o'zgargan bo'lishi mumkin): {u}")
        if len(unmatched) > 20:
            out(f"  ? ... yana {len(unmatched) - 20} ta")

        if not apply:
            out("Sinov rejimi — hech narsa o'zgarmadi. Yozish uchun --apply qo'shing.")
            return

        with suppress_lessons_backup(), transaction.atomic():
            for lesson, change in lesson_updates:
                # update(): no updated_at bump, so no re-translation is queued
                Lesson.objects.filter(pk=lesson.pk).update(**change)
            for exp, ty in exp_updates:
                Experiment.objects.filter(pk=exp.pk).update(type=ty)
        if lesson_updates or exp_updates:
            send_lessons_backup()
        out(f"Tayyor: {len(lesson_updates)} dars, {len(exp_updates)} tajriba")
