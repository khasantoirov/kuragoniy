import logging

from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response

from common.audit import diff_fields, notify_admin_action, snapshot
from common.permissions import IsAdminOrDevSuperuser, IsApproved
from common.uploads import delete_file_field, validate_upload

from .models import Experiment, Lesson, QuarterLock
from .serializers import LessonSerializer, QuarterLockSerializer
from .signals import send_lessons_backup, suppress_lessons_backup

logger = logging.getLogger(__name__)

LESSON_FILE_EXTENSIONS = ('.pdf', '.doc', '.docx')
LESSON_FILE_MAX_MB = 20

# Tracked for the admin-audit diff (common/audit.py) — translations
# (_ru/_en) and `file`/`updated_at`/`translated_at` are excluded since
# they're bot/system-managed, not something an admin directly edits.
LESSON_AUDIT_FIELDS = ['title', 'grade', 'chorak', 'hafta', 'goal', 'file_url']
LESSON_AUDIT_LABELS = {
    'title': 'Nomi', 'grade': 'Sinf', 'chorak': 'Chorak', 'hafta': 'Hafta',
    'goal': 'Maqsad', 'file_url': 'Fayl havolasi',
}
EXPERIMENT_AUDIT_FIELDS = ['name', 'desc', 'materials', 'steps', 'concepts', 'minutes', 'safety', 'image', 'video']
EXPERIMENT_AUDIT_LABELS = {
    'name': 'Nomi', 'desc': 'Tavsif', 'materials': 'Jihozlar',
    'steps': 'Tartib', 'concepts': 'Tushunchalar',
    'minutes': 'Vaqti', 'safety': 'Xavfsizlik', 'image': 'Rasm', 'video': 'Video',
}


def _to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _renumber_grade(grade, exclude_id=None):
    """hafta is a continuous week-of-year counter across all 4 quarters
    (chorak 1 = weeks 1-9, chorak 2 continues from 10, etc — not reset
    per quarter), so closing a gap after a delete means renumbering the
    whole grade in (chorak, hafta) order, not just one quarter.

    One bulk_update instead of N sequential saves — with 30-40 lessons per
    grade the per-row round trips were slow enough to open a real race on
    the frontend's Ctrl+Z: pressing undo before this finished meant the
    delete's history entry hadn't been recorded yet."""
    lessons = Lesson.objects.filter(grade=grade)
    if exclude_id is not None:
        lessons = lessons.exclude(id=exclude_id)
    to_update = []
    for i, lesson in enumerate(lessons.order_by('chorak', 'hafta', 'id'), start=1):
        if lesson.hafta != i:
            lesson.hafta = i
            to_update.append(lesson)
    if to_update:
        Lesson.objects.bulk_update(to_update, ['hafta'])


def _insert_lesson(lesson, grade, chorak, index):
    """Places `lesson` at 0-based `index` within (grade, chorak)'s local
    order, then renumbers hafta for the whole grade in one bulk_update so
    the continuous week-of-year count stays gap-free. Shared by reorder
    (drag-to-move within a grade) and move_copy (send to another grade) —
    `lesson.grade` must already match `grade` in the database (callers
    that change grade save that first) since this only queries, never
    writes, the grade field itself."""
    others = Lesson.objects.filter(grade=grade).exclude(id=lesson.id).order_by('chorak', 'hafta', 'id')
    by_chorak: dict[int, list[Lesson]] = {1: [], 2: [], 3: [], 4: []}
    for l in others:
        by_chorak[l.chorak].append(l)

    target = by_chorak[chorak]
    index = max(0, min(index, len(target)))
    target.insert(index, lesson)

    ordered = by_chorak[1] + by_chorak[2] + by_chorak[3] + by_chorak[4]
    to_update = []
    for i, l in enumerate(ordered, start=1):
        if l.id == lesson.id:
            lesson.chorak = chorak
            lesson.hafta = i
            to_update.append(lesson)
        elif l.hafta != i:
            l.hafta = i
            to_update.append(l)
    if to_update:
        Lesson.objects.bulk_update(to_update, ['chorak', 'hafta'])


class LessonViewSet(viewsets.ModelViewSet):
    """Read = any approved user; write = admin only — mirrors
    firestore.rules' lessons/{id} rule."""

    queryset = Lesson.objects.prefetch_related('experiments').all()
    serializer_class = LessonSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsApproved(), IsAdminOrDevSuperuser()]

    def get_queryset(self):
        qs = super().get_queryset()
        grade = self.request.query_params.get('grade')
        chorak = self.request.query_params.get('chorak')
        if grade:
            qs = qs.filter(grade=grade)
        if chorak:
            qs = qs.filter(chorak=chorak)
        if not self.request.user.is_admin:
            locks = dict(QuarterLock.objects.filter(chorak__in=(1, 2, 3, 4)).values_list('chorak', 'is_open'))
            open_chorak = {ch for ch in (1, 2, 3, 4) if locks.get(ch, ch == 1)}
            qs = qs.filter(chorak__in=open_chorak)
        return qs

    def _label(self, lesson):
        return f"«{lesson.title}» ({lesson.grade}-sinf, {lesson.chorak}-chorak)"

    def _experiment_diff_lines(self, before_exps: dict, lesson: Lesson) -> list[str]:
        # A fresh queryset, not lesson.experiments.all() — that manager may
        # still be serving a prefetch_related cache from get_queryset()
        # fetched before _sync_experiments()'s raw filter().update()/
        # create()/delete() calls, which don't invalidate it.
        after_exps = {e.id: e for e in Experiment.objects.filter(lesson_id=lesson.id)}
        lines = []
        for eid, exp in after_exps.items():
            if eid not in before_exps:
                lines.append(f"+ Tajriba qo'shildi: «{exp.name}»")
            else:
                d = diff_fields(
                    snapshot(before_exps[eid], EXPERIMENT_AUDIT_FIELDS), exp,
                    EXPERIMENT_AUDIT_FIELDS, EXPERIMENT_AUDIT_LABELS,
                )
                if d:
                    lines.append(f"~ Tajriba tahrirlandi: «{exp.name}»\n{d}")
        for eid, exp in before_exps.items():
            if eid not in after_exps:
                lines.append(f"- Tajriba o'chirildi: «{exp.name}»")
        return lines

    def perform_create(self, serializer):
        lesson = serializer.save()
        lines = [f"Dars qo'shdi: {self._label(lesson)}"]
        if lesson.goal:
            lines.append(f"• Maqsad: {lesson.goal}")
        for exp in lesson.experiments.all():
            lines.append(f"+ Tajriba: «{exp.name}»")
        notify_admin_action(self.request.user, '\n'.join(lines))

    def perform_update(self, serializer):
        lesson_before = serializer.instance
        before = snapshot(lesson_before, LESSON_AUDIT_FIELDS)
        before_exps = {e.id: e for e in lesson_before.experiments.all()}

        lesson = serializer.save()

        lines = []
        field_diff = diff_fields(before, lesson, LESSON_AUDIT_FIELDS, LESSON_AUDIT_LABELS)
        if field_diff:
            lines.append(field_diff)
        lines.extend(self._experiment_diff_lines(before_exps, lesson))
        if lines:
            notify_admin_action(self.request.user, f"Darsni tahrirladi: {self._label(lesson)}\n" + '\n'.join(lines))

    def perform_destroy(self, instance):
        grade = instance.grade
        label = self._label(instance)
        exp_names = list(instance.experiments.values_list('name', flat=True))
        lines = [f"Darsni o'chirdi: {label}"]
        if instance.goal:
            lines.append(f"• Maqsad edi: {instance.goal}")
        if exp_names:
            lines.append("• Tajribalar: " + ', '.join(exp_names))
        delete_file_field(instance, 'file')
        instance.delete()
        _renumber_grade(grade)
        notify_admin_action(self.request.user, '\n'.join(lines))

    @action(detail=True, methods=['post'], url_path='upload-file', parser_classes=[MultiPartParser, FormParser])
    def upload_file(self, request, pk=None):
        lesson = self.get_object()
        f = request.FILES.get('file')
        if not f:
            return Response({'detail': 'file required'}, status=400)
        validate_upload(f, LESSON_FILE_EXTENSIONS, LESSON_FILE_MAX_MB)
        delete_file_field(lesson, 'file')
        lesson.file = f
        lesson.save(update_fields=['file'])
        notify_admin_action(request.user, f"Darsga fayl biriktirdi: {self._label(lesson)}")
        return Response(LessonSerializer(lesson, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='remove-file')
    def remove_file(self, request, pk=None):
        lesson = self.get_object()
        delete_file_field(lesson, 'file')
        lesson.file = None
        lesson.save(update_fields=['file'])
        notify_admin_action(request.user, f"Dars faylini o'chirdi: {self._label(lesson)}")
        return Response(LessonSerializer(lesson, context={'request': request}).data)

    @action(detail=False, methods=['get', 'post'], url_path='quarter-locks')
    def quarter_locks(self, request):
        """GET: {"1": bool, "2": bool, "3": bool, "4": bool} open-state per
        quarter (missing row = open for chorak 1, closed for 2-4). POST
        (admin-only, enforced by get_permissions since it's a non-safe
        method): {chorak, is_open} upserts one quarter's lock."""
        if request.method == 'GET':
            rows = {r.chorak: r.is_open for r in QuarterLock.objects.all()}
            return Response({str(c): rows.get(c, c == 1) for c in (1, 2, 3, 4)})

        chorak = request.data.get('chorak')
        if chorak not in (1, 2, 3, 4):
            return Response({'detail': 'chorak must be 1-4'}, status=400)
        is_open = bool(request.data.get('is_open'))
        existing = QuarterLock.objects.filter(chorak=chorak).first()
        was_open = existing.is_open if existing else chorak == 1
        lock, _ = QuarterLock.objects.update_or_create(chorak=chorak, defaults={'is_open': is_open})
        if was_open != is_open:
            state_label = {True: 'ochiq', False: 'yopiq'}
            notify_admin_action(request.user, f"{chorak}-chorak holati: {state_label[was_open]} → {state_label[is_open]}")
        return Response(QuarterLockSerializer(lock).data)

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Moves one lesson to (chorak, index) — index is its desired 0-based
        position within that quarter's own list — then renumbers hafta for
        the whole grade in one pass so the continuous week-of-year count
        (see _renumber_grade) stays gap-free after 'siljitib ko'chirish'
        (drag to move), the same as perform_destroy does after a delete."""
        try:
            lesson = Lesson.objects.get(id=request.data.get('id'))
        except (Lesson.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'not found'}, status=404)

        to_chorak = request.data.get('chorak')
        if to_chorak not in (1, 2, 3, 4):
            return Response({'detail': 'chorak must be 1-4'}, status=400)
        try:
            index = int(request.data.get('index'))
        except (TypeError, ValueError):
            return Response({'detail': 'index required'}, status=400)

        with transaction.atomic():
            _insert_lesson(lesson, lesson.grade, to_chorak, index)

        return Response(LessonSerializer(lesson).data)

    @action(detail=True, methods=['post'], url_path='move-copy')
    def move_copy(self, request, pk=None):
        """Copies or moves a whole lesson (with its experiments) to another
        grade/quarter, appended at the end of that quarter's list — the
        lesson-level counterpart to copying/moving a single experiment to
        another lesson. mode='copy' duplicates without touching the
        original; mode='move' relocates it and renumbers the gap closed in
        its original grade if that grade changed.

        Translations (_ru/_en) aren't copied — same as the existing
        experiment copy/move, which drops them too (they're read_only on
        ExperimentSerializer) — the bot re-translates the new/moved
        content instead of carrying over translations of text that may no
        longer read as freshly authored."""
        source = self.get_object()
        mode = request.data.get('mode')
        if mode not in ('move', 'copy'):
            return Response({'detail': "mode must be 'move' or 'copy'"}, status=400)
        target_grade = request.data.get('grade')
        if target_grade not in dict(Lesson.Grade.choices):
            return Response({'detail': "grade must be one of: " + ', '.join(dict(Lesson.Grade.choices))}, status=400)
        target_chorak = request.data.get('chorak')
        if target_chorak not in (1, 2, 3, 4):
            return Response({'detail': 'chorak must be 1-4'}, status=400)

        original_grade = source.grade
        original_chorak = source.chorak

        with transaction.atomic():
            if mode == 'copy':
                result = Lesson.objects.create(
                    title=source.title,
                    grade=target_grade, chorak=target_chorak, hafta=0,
                    goal=source.goal,
                    file_url=source.file_url,
                )
                for exp in source.experiments.all():
                    Experiment.objects.create(
                        lesson=result, order=exp.order,
                        name=exp.name, desc=exp.desc,
                        materials=exp.materials, steps=exp.steps, concepts=exp.concepts,
                        minutes=exp.minutes, safety=exp.safety,
                        image=exp.image, video=exp.video,
                    )
            else:
                source.grade = target_grade
                source.save(update_fields=['grade'])
                result = source

            target_index = Lesson.objects.filter(grade=target_grade, chorak=target_chorak).exclude(id=result.id).count()
            _insert_lesson(result, target_grade, target_chorak, target_index)

            if mode == 'move' and original_grade != target_grade:
                _renumber_grade(original_grade)

        verb = "ko'chirdi" if mode == 'move' else 'nusxaladi'
        notify_admin_action(
            request.user,
            f"Darsni {verb}: «{result.title}»\n"
            f"• Avval: {original_grade}-sinf, {original_chorak}-chorak\n"
            f"• Endi: {target_grade}-sinf, {target_chorak}-chorak",
        )
        return Response(LessonSerializer(result, context={'request': request}).data)

    @action(detail=False, methods=['post'])
    def import_translations(self, request):
        """Bulk-writes _ru/_en fields from an admin-uploaded JSON export —
        the manual counterpart to the bot's automated translation worker
        (telegrambot/bot/translation.py). Those fields are read_only on
        the normal serializer (bot-only) so this bypasses the serializer
        and writes the model directly; admin-only via get_permissions.

        Row shape (matches the old exportLessons()/admin.js format):
        {id?, grade, chorak, hafta, title, title_ru, title_en, goal_ru,
         goal_en, experiments: [{id, name_ru, name_en, desc_ru, desc_en,
         safety_ru, safety_en, materials_ru, materials_en, steps_ru, steps_en,
         concepts_ru, concepts_en}]}
        """
        rows = request.data if isinstance(request.data, list) else []

        lessons = list(Lesson.objects.prefetch_related('experiments').all())
        by_id = {l.id: l for l in lessons}
        by_key = {(l.grade, l.chorak, l.hafta, l.title): l for l in lessons}

        ok = 0
        skipped = 0
        for row in rows:
            lesson = by_id.get(row.get('id'))
            if lesson is None:
                key = (row.get('grade'), row.get('chorak'), row.get('hafta'), row.get('title'))
                lesson = by_key.get(key)
            if lesson is None:
                skipped += 1
                continue

            lesson.title_ru = row.get('title_ru') or ''
            lesson.title_en = row.get('title_en') or ''
            lesson.goal_ru = row.get('goal_ru') or ''
            lesson.goal_en = row.get('goal_en') or ''
            lesson.translated_at = timezone.now()
            lesson.save(update_fields=['title_ru', 'title_en', 'goal_ru', 'goal_en', 'translated_at'])

            tr_by_id = {e['id']: e for e in row.get('experiments') or [] if e.get('id')}
            for exp in lesson.experiments.all():
                tr = tr_by_id.get(exp.id)
                if not tr:
                    continue
                exp.name_ru = tr.get('name_ru') or ''
                exp.name_en = tr.get('name_en') or ''
                exp.desc_ru = tr.get('desc_ru') or ''
                exp.desc_en = tr.get('desc_en') or ''
                exp.safety_ru = tr.get('safety_ru') or ''
                exp.safety_en = tr.get('safety_en') or ''
                exp.materials_ru = tr.get('materials_ru') if isinstance(tr.get('materials_ru'), list) else []
                exp.materials_en = tr.get('materials_en') if isinstance(tr.get('materials_en'), list) else []
                exp.steps_ru = tr.get('steps_ru') if isinstance(tr.get('steps_ru'), list) else []
                exp.steps_en = tr.get('steps_en') if isinstance(tr.get('steps_en'), list) else []
                exp.concepts_ru = tr.get('concepts_ru') if isinstance(tr.get('concepts_ru'), list) else []
                exp.concepts_en = tr.get('concepts_en') if isinstance(tr.get('concepts_en'), list) else []
                exp.save(update_fields=[
                    'name_ru', 'name_en', 'desc_ru', 'desc_en', 'safety_ru', 'safety_en',
                    'materials_ru', 'materials_en', 'steps_ru', 'steps_en',
                    'concepts_ru', 'concepts_en',
                ])
            ok += 1

        return Response({'ok': ok, 'skipped': skipped})

    @action(detail=False, methods=['post'])
    def bulk_import(self, request):
        """Bulk-create lessons from an admin-uploaded JSON file (the
        AdminPage "Darslarni import qilish" flow) — replaces the old
        approach of the frontend looping N sequential POST /lessons/ calls,
        which had no per-row error isolation, no duplicate detection, and
        triggered signals.backup_lessons_on_change's full-DB Telegram dump
        once per row.

        Body: {"mode": "add" | "replace", "rows": [<row matching
        LessonSerializer's writable fields, e.g. title/grade/chorak/hafta/
        goal/file_url/experiments>, ...]}.

        mode='replace' deletes every existing Lesson in the grades present
        in `rows` first — done here via a direct ORM filter().delete() loop
        rather than the frontend's old GET-then-DELETE-per-row approach,
        which silently missed lessons past the first paginated page.
        _renumber_grade is deliberately NOT called after the delete or at
        the end: hafta is caller-supplied data (ordinary single-lesson
        create doesn't renumber either, see perform_create above), and
        renumbering mid-batch would just be wasted work immediately
        overwritten by the incoming rows, or worse, silently close a
        gap the file left on purpose.

        Each row is created in its own transaction.atomic() (mirroring
        management/commands/import_steam_lessons.py's pattern) so one bad
        row can't corrupt itself, but a failure doesn't abort the batch —
        it's recorded in `errors` and the loop continues, since (unlike
        that hand-vetted command's hardcoded data) this file comes from an
        admin upload that may contain mistakes.

        Duplicate (grade, chorak, hafta) slots are skipped, not created —
        checked against both pre-existing DB rows (post-delete, so only
        relevant in 'add' mode or for grades not part of a 'replace') and
        rows already created earlier in this same request.

        The whole operation happens inside suppress_lessons_backup() so
        creating/deleting dozens of lessons sends exactly one backup dump
        (and one notify_admin_action summary) instead of one per row."""
        mode = request.data.get('mode')
        if mode not in ('add', 'replace'):
            return Response({'detail': "mode must be 'add' or 'replace'"}, status=400)
        rows = request.data.get('rows')
        if not isinstance(rows, list) or not rows:
            return Response({'detail': 'rows must be a non-empty list'}, status=400)

        valid_grades = dict(Lesson.Grade.choices)
        grades_in_file = sorted({
            row.get('grade') for row in rows
            if isinstance(row, dict) and row.get('grade') in valid_grades
        })

        created_ids = []
        skipped = []
        errors = []
        deleted_count = 0

        with suppress_lessons_backup():
            if mode == 'replace' and grades_in_file:
                with transaction.atomic():
                    for lesson in Lesson.objects.filter(grade__in=grades_in_file):
                        delete_file_field(lesson, 'file')
                        lesson.delete()
                        deleted_count += 1

            existing_keys = set(
                Lesson.objects.filter(grade__in=grades_in_file).values_list('grade', 'chorak', 'hafta')
            )
            seen_keys = set()

            for i, row in enumerate(rows):
                if not isinstance(row, dict):
                    errors.append({'row': i, 'title': None, 'errors': {'_row': ['Qator obyekt emas']}})
                    continue

                key = (row.get('grade'), _to_int(row.get('chorak')), _to_int(row.get('hafta')))
                if key in existing_keys or key in seen_keys:
                    skipped.append({
                        'row': i, 'title': row.get('title'), 'reason': 'duplicate',
                        'grade': key[0], 'chorak': key[1], 'hafta': key[2],
                    })
                    continue

                try:
                    with transaction.atomic():
                        serializer = LessonSerializer(data=row)
                        serializer.is_valid(raise_exception=True)
                        lesson = serializer.save()
                except ValidationError as e:
                    errors.append({'row': i, 'title': row.get('title'), 'errors': e.detail})
                    continue
                except Exception:
                    logger.exception('bulk_import: unexpected error on row %s', i)
                    errors.append({'row': i, 'title': row.get('title'), 'errors': {'_row': ['Kutilmagan xato']}})
                    continue

                seen_keys.add(key)
                created_ids.append(lesson.id)

        if created_ids or deleted_count:
            send_lessons_backup()
            lines = [f"Darslarni import qildi ({mode}): {len(created_ids)} ta qo'shildi"]
            if deleted_count:
                lines.append(f"• O'chirildi: {deleted_count} ta")
            if skipped:
                lines.append(f"• O'tkazib yuborildi (dublikat): {len(skipped)} ta")
            if errors:
                lines.append(f"• Xato: {len(errors)} ta")
            if grades_in_file:
                lines.append(f"• Sinflar: {', '.join(grades_in_file)}")
            notify_admin_action(request.user, '\n'.join(lines))

        return Response({
            'created': len(created_ids),
            'deleted': deleted_count,
            'grades_replaced': grades_in_file if mode == 'replace' else [],
            'skipped': skipped,
            'errors': errors,
        })
