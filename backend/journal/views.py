from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsApproved

from .locks import ALL_PAST_DAYS, LOCKED_DETAIL, NOT_OWNER_DETAIL, can_edit_day, is_owner, lock_info, today
from .models import AttendanceEntry, ClassDay, FinalGrade, GradeEntry, JournalClass, JournalEditGrant, Student
from .scales import convert, level
from .serializers import (
    BulkDaySerializer,
    ClassDaySerializer,
    EditGrantSerializer,
    FinalGradeSerializer,
    GrantCreateSerializer,
    GrantDecisionSerializer,
    GrantRequestSerializer,
    JournalClassSerializer,
    StudentSerializer,
    class_label,
)


def _locked(user, journal_class, day):
    if not is_owner(user, journal_class):
        return Response({'detail': NOT_OWNER_DETAIL, 'code': 'not_owner'}, status=status.HTTP_403_FORBIDDEN)
    return Response({'detail': LOCKED_DETAIL, 'code': 'journal_locked', 'date': day},
                    status=status.HTTP_403_FORBIDDEN)


class JournalClassViewSet(viewsets.ModelViewSet):
    """Owner CRUD; admins get cross-teacher read via ?teacher=<id> —
    mirrors firestore.rules' journals/{uid}/classes/{classId} rule."""

    serializer_class = JournalClassSerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        user = self.request.user
        teacher_id = self.request.query_params.get('teacher')
        qs = JournalClass.objects.prefetch_related('students')
        # Administrators may look at any teacher's journal, never write to
        # it — writes always resolve to the requester's own classes.
        if teacher_id and user.is_admin and self.request.method in permissions.SAFE_METHODS:
            return qs.filter(teacher_id=teacher_id)
        return qs.filter(teacher=user)

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)

    def perform_update(self, serializer):
        """Changing a class's scale carries every mark already given over
        to the new scale, keeping each one in its colour band."""
        old = serializer.instance.scale
        with transaction.atomic():
            cls = serializer.save()
            if cls.scale != old:
                for model, filt in ((GradeEntry, {'day__journal_class': cls}), (FinalGrade, {'student__journal_class': cls})):
                    rows = list(model.objects.filter(**filt))
                    for r in rows:
                        r.mark = convert(r.mark, old, cls.scale)
                        r.level = level(r.mark, cls.scale)
                    model.objects.bulk_update(rows, ['mark', 'level'])

    @action(detail=True, methods=['get'])
    def grid(self, request, pk=None):
        """Denormalized day x student grid, shaped for direct table
        rendering — computed server-side instead of the old client
        re-deriving the positional 'date:studentIndex' key scheme."""
        journal_class = self.get_object()
        students = list(journal_class.students.filter(active=True).order_by('order'))
        days = list(journal_class.days.order_by('date'))

        marks_by_day = {}
        for g in GradeEntry.objects.filter(day__journal_class=journal_class).select_related('student', 'day'):
            marks_by_day.setdefault(g.day_id, {})[g.student_id] = g.mark

        attendance_by_day = {}
        for a in AttendanceEntry.objects.filter(day__journal_class=journal_class).select_related('student', 'day'):
            attendance_by_day.setdefault(a.day_id, {})[a.student_id] = a.status

        finals_by_chorak = {}
        for f in FinalGrade.objects.filter(student__journal_class=journal_class):
            finals_by_chorak.setdefault(f.chorak, {})[f.student_id] = f.mark

        return Response({
            'scale': journal_class.scale,
            'students': StudentSerializer(students, many=True).data,
            'days': [
                {
                    **ClassDaySerializer(d).data,
                    'marks': marks_by_day.get(d.id, {}),
                    'attendance': attendance_by_day.get(d.id, {}),
                }
                for d in days
            ],
            'finals': finals_by_chorak,
            'lock': lock_info(request.user, journal_class),
        })

    @action(detail=True, methods=['post'], url_path='bulk-marks')
    def bulk_marks(self, request, pk=None):
        journal_class = self.get_object()
        serializer = BulkDaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if not can_edit_day(request.user, journal_class, data['date']):
            return _locked(request.user, journal_class, data['date'])
        scale = journal_class.scale
        if any(e.get('mark') is not None and e['mark'] > scale for e in data.get('marks', [])):
            return Response({'detail': f"Baho 0 dan {scale} gacha bo'ladi."}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            defaults = {'chorak': data['chorak'], 'topic': data.get('topic', '')}
            if 'period' in data:
                defaults['period'] = data['period']
            day, _ = ClassDay.objects.update_or_create(
                journal_class=journal_class,
                date=data['date'],
                defaults=defaults,
            )

            for entry in data.get('marks', []):
                if entry.get('mark') is None:
                    GradeEntry.objects.filter(day=day, student_id=entry['student_id']).delete()
                else:
                    GradeEntry.objects.update_or_create(
                        day=day, student_id=entry['student_id'],
                        defaults={'mark': entry['mark'], 'level': level(entry['mark'], scale)},
                    )

            for entry in data.get('attendance', []):
                if not entry.get('status'):
                    AttendanceEntry.objects.filter(day=day, student_id=entry['student_id']).delete()
                else:
                    AttendanceEntry.objects.update_or_create(
                        day=day, student_id=entry['student_id'],
                        defaults={'status': entry['status']},
                    )

        return Response(self.grid(request, pk=pk).data)

    @action(detail=True, methods=['post'], url_path='drop-day')
    def drop_day(self, request, pk=None):
        journal_class = self.get_object()
        date = parse_date(str(request.data.get('date') or ''))
        if date is None:
            return Response({'detail': "Sana noto'g'ri."}, status=status.HTTP_400_BAD_REQUEST)
        if not can_edit_day(request.user, journal_class, date):
            return _locked(request.user, journal_class, date)
        ClassDay.objects.filter(journal_class=journal_class, date=date).delete()
        return Response(self.grid(request, pk=pk).data)

    @action(detail=True, methods=['post'], url_path='set-final')
    def set_final(self, request, pk=None):
        journal_class = self.get_object()
        student_id = request.data.get('student_id')
        chorak = request.data.get('chorak')
        mark = request.data.get('mark')
        student = journal_class.students.get(id=student_id)
        # 0 is a real mark ("yomon"), so only an empty value clears it.
        if mark in (None, ''):
            FinalGrade.objects.filter(student=student, chorak=chorak).delete()
        else:
            try:
                mark = int(mark)
            except (TypeError, ValueError):
                mark = -1
            scale = journal_class.scale
            if not 0 <= mark <= scale:
                return Response({'detail': f"Baho 0 dan {scale} gacha bo'ladi."}, status=status.HTTP_400_BAD_REQUEST)
            FinalGrade.objects.update_or_create(student=student, chorak=chorak,
                                                defaults={'mark': mark, 'level': level(mark, scale)})
        return Response(self.grid(request, pk=pk).data)


class StudentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        user = self.request.user
        qs = Student.objects.filter(journal_class__teacher=user)
        class_id = self.request.query_params.get('journal_class')
        if class_id:
            qs = qs.filter(journal_class_id=class_id)
        return qs

    def perform_create(self, serializer):
        journal_class_id = self.request.data.get('journal_class')
        journal_class = JournalClass.objects.get(id=journal_class_id, teacher=self.request.user)
        serializer.save(journal_class=journal_class)

    def perform_destroy(self, instance):
        # Soft-delete: keep historical grades/attendance intact.
        instance.active = False
        instance.save(update_fields=['active'])


class FinalGradeViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only: quarter grades are written through the class's
    set-final action, which checks the class's scale and sets the level."""

    serializer_class = FinalGradeSerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        return FinalGrade.objects.filter(student__journal_class__teacher=self.request.user)


def _dates(grant) -> str:
    if grant.date_from == grant.date_to:
        return f'{grant.date_from:%d.%m.%Y}'
    return f'{grant.date_from:%d.%m}–{grant.date_to:%d.%m.%Y}'


def _until(grant) -> str:
    return f'{timezone.localtime(grant.expires_at):%d.%m.%Y %H:%M}'


class EditGrantViewSet(viewsets.GenericViewSet):
    """Jurnal → Ruxsatlar. A teacher asks to reopen a closed day (POST
    journal_class/date/reason); an administrator approves or rejects it,
    opens days directly (POST teacher/date_from/date_to/hours), or revokes
    an open permission. Every step reaches the other side as a 'jurnal'
    notification."""

    serializer_class = EditGrantSerializer
    permission_classes = [IsApproved]
    pagination_class = None

    def get_queryset(self):
        qs = JournalEditGrant.objects.select_related('teacher', 'journal_class', 'decided_by')
        if not self.request.user.is_admin:
            qs = qs.filter(teacher=self.request.user)
        return qs

    def _admin_only(self, request):
        if not request.user.is_admin:
            return Response({'detail': "Bu amal faqat administrator uchun."}, status=status.HTTP_403_FORBIDDEN)
        return None

    def list(self, request):
        qs = self.get_queryset()
        wanted = request.query_params.get('status')
        if wanted == 'active':
            qs = qs.filter(status=JournalEditGrant.Status.APPROVED, expires_at__gt=timezone.now())
        elif wanted == 'history':
            qs = qs.exclude(status=JournalEditGrant.Status.PENDING).exclude(
                status=JournalEditGrant.Status.APPROVED, expires_at__gt=timezone.now())
        elif wanted:
            qs = qs.filter(status=wanted)
        return Response(EditGrantSerializer(qs[:200], many=True).data)

    def create(self, request):
        return self._grant(request) if request.user.is_admin else self._ask(request)

    def _ask(self, request):
        from accounts.models import User
        from notifications.models import Kind
        from notifications.service import notify

        s = GrantRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = request.user
        journal_class = JournalClass.objects.filter(pk=s.validated_data['journal_class'], teacher=user).first()
        if journal_class is None:
            return Response({'detail': 'Sinf topilmadi.'}, status=status.HTTP_404_NOT_FOUND)
        day = s.validated_data['date']
        if day == today():
            return Response({'detail': "Bugungi kunni ruxsatsiz tahrirlash mumkin."}, status=status.HTTP_400_BAD_REQUEST)
        if day > today():
            return Response({'detail': "Kelgusi kunlar uchun baho va davomat kiritilmaydi."},
                            status=status.HTTP_400_BAD_REQUEST)
        waiting = JournalEditGrant.objects.filter(
            teacher=user, journal_class=journal_class, status=JournalEditGrant.Status.PENDING,
            date_from__lte=day, date_to__gte=day,
        ).first()
        if waiting:
            return Response(EditGrantSerializer(waiting).data)
        if can_edit_day(user, journal_class, day):
            return Response({'detail': "Bu kun uchun ruxsat allaqachon berilgan."}, status=status.HTTP_400_BAD_REQUEST)

        grant = JournalEditGrant.objects.create(
            teacher=user, journal_class=journal_class, date_from=day, date_to=day,
            reason=s.validated_data['reason'],
        )
        admins = [u for u in User.objects.filter(is_active=True).exclude(pk=user.pk) if u.is_admin]
        notify(
            admins, Kind.JURNAL, f"Jurnal ruxsati so'raldi: {user.name}",
            f"{class_label(journal_class)} · {_dates(grant)}\nSabab: {grant.reason}", '/journal?tab=access',
            telegram_text=(
                f"📒 {user.name} jurnalni tahrirlash uchun ruxsat so'radi.\n"
                f"Sinf: {class_label(journal_class)}\nSana: {_dates(grant)}\nSabab: {grant.reason}\n\n"
                "Ruxsat berish: Jurnal → Ruxsatlar."
            ),
            dedupe_key=f'jgrant:{grant.id}',
        )
        return Response(EditGrantSerializer(grant).data, status=status.HTTP_201_CREATED)

    def _grant(self, request):
        from accounts.models import User

        s = GrantCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data
        teacher = User.objects.filter(pk=data['teacher'], is_active=True).first()
        if teacher is None or teacher.is_student or teacher.is_observer:
            return Response({'detail': "O'qituvchi topilmadi."}, status=status.HTTP_404_NOT_FOUND)
        journal_class = None
        if data.get('journal_class'):
            journal_class = JournalClass.objects.filter(pk=data['journal_class'], teacher=teacher).first()
            if journal_class is None:
                return Response({'detail': 'Sinf topilmadi.'}, status=status.HTTP_404_NOT_FOUND)
        now = timezone.now()
        if data.get('all_past'):
            date_from, date_to = today() - ALL_PAST_DAYS, today() - timedelta(days=1)
        else:
            date_from, date_to = data['date_from'], data['date_to']
        grant = JournalEditGrant.objects.create(
            teacher=teacher, journal_class=journal_class, date_from=date_from, date_to=date_to,
            status=JournalEditGrant.Status.APPROVED, decided_by=request.user, decided_at=now,
            expires_at=now + timedelta(hours=data['hours']), note=data.get('note', ''),
        )
        # The teacher's own requests for days this opens are answered too.
        answered = JournalEditGrant.objects.filter(
            teacher=teacher, status=JournalEditGrant.Status.PENDING, date_from__gte=date_from, date_to__lte=date_to,
        )
        if journal_class is not None:
            answered = answered.filter(journal_class=journal_class)
        for req in answered:
            req.status = JournalEditGrant.Status.APPROVED
            req.decided_by, req.decided_at, req.expires_at = request.user, now, grant.expires_at
            req.save(update_fields=['status', 'decided_by', 'decided_at', 'expires_at'])
            self._settle_inbox(req)
        if teacher.pk != request.user.pk:
            self._tell_teacher(grant, 'approved')
        return Response(EditGrantSerializer(grant).data, status=status.HTTP_201_CREATED)

    def _tell_teacher(self, grant, what):
        from notifications.models import Kind
        from notifications.service import notify

        where = f'{class_label(grant.journal_class)} · {_dates(grant)}'
        note = f'\nIzoh: {grant.note}' if grant.note else ''
        if what == 'approved':
            title, body = 'Jurnalni tahrirlashga ruxsat berildi', f'{where} · {_until(grant)} gacha{note}'
        elif what == 'rejected':
            title, body = "Jurnal so'rovingiz rad etildi", f'{where}{note}'
        else:
            title, body = 'Jurnal ruxsati bekor qilindi', where
        notify(grant.teacher, Kind.JURNAL, title, body, '/journal', telegram_text=f'📒 {title}\n{body}')

    def _settle_inbox(self, grant):
        """Once one administrator has answered, the request stops waiting
        in every other administrator's inbox."""
        from notifications.models import Notification

        Notification.objects.filter(dedupe_key=f'jgrant:{grant.id}', read_at__isnull=True).update(read_at=timezone.now())

    def _pending(self, pk):
        return self.get_queryset().filter(pk=pk, status=JournalEditGrant.Status.PENDING).first()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        if (denied := self._admin_only(request)):
            return denied
        grant = self._pending(pk)
        if grant is None:
            return Response({'detail': "So'rov topilmadi yoki allaqachon ko'rib chiqilgan."}, status=status.HTTP_404_NOT_FOUND)
        s = GrantDecisionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        now = timezone.now()
        grant.status = JournalEditGrant.Status.APPROVED
        grant.decided_by, grant.decided_at = request.user, now
        grant.expires_at = now + timedelta(hours=s.validated_data['hours'])
        grant.note = s.validated_data.get('note', '')
        grant.save()
        self._settle_inbox(grant)
        self._tell_teacher(grant, 'approved')
        return Response(EditGrantSerializer(grant).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if (denied := self._admin_only(request)):
            return denied
        grant = self._pending(pk)
        if grant is None:
            return Response({'detail': "So'rov topilmadi yoki allaqachon ko'rib chiqilgan."}, status=status.HTTP_404_NOT_FOUND)
        grant.status = JournalEditGrant.Status.REJECTED
        grant.decided_by, grant.decided_at = request.user, timezone.now()
        grant.note = str(request.data.get('note') or '')[:300]
        grant.save()
        self._settle_inbox(grant)
        self._tell_teacher(grant, 'rejected')
        return Response(EditGrantSerializer(grant).data)

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        if (denied := self._admin_only(request)):
            return denied
        grant = self.get_queryset().filter(pk=pk, status=JournalEditGrant.Status.APPROVED).first()
        if grant is None:
            return Response({'detail': 'Ruxsat topilmadi.'}, status=status.HTTP_404_NOT_FOUND)
        grant.status = JournalEditGrant.Status.REVOKED
        grant.save(update_fields=['status'])
        if grant.expires_at and grant.expires_at > timezone.now():
            self._tell_teacher(grant, 'revoked')
        return Response(EditGrantSerializer(grant).data)

    @action(detail=False, methods=['get'])
    def teachers(self, request):
        """Everyone who teaches (administrators included — their own
        journals are locked too), with their classes, the days open to
        them right now and their waiting requests."""
        from accounts.models import User

        if (denied := self._admin_only(request)):
            return denied
        people = [
            u for u in User.objects.filter(is_active=True).exclude(role__in=[User.Role.STUDENT, User.Role.KUZATUVCHI])
            if u.is_approved_effective
        ]
        out = {u.pk: {'id': u.pk, 'name': u.name or u.login_name, 'role': u.role, 'classes': [], 'open': [], 'pending': 0}
               for u in people}
        for c in JournalClass.objects.filter(teacher_id__in=out).order_by('name'):
            out[c.teacher_id]['classes'].append({'id': c.id, 'label': class_label(c)})
        for g in JournalEditGrant.objects.select_related('journal_class').filter(
                teacher_id__in=out, status=JournalEditGrant.Status.APPROVED, expires_at__gt=timezone.now()):
            out[g.teacher_id]['open'].append({
                'id': g.id, 'class_label': class_label(g.journal_class), 'date_from': g.date_from,
                'date_to': g.date_to, 'expires_at': g.expires_at,
            })
        for g in JournalEditGrant.objects.filter(teacher_id__in=out, status=JournalEditGrant.Status.PENDING):
            out[g.teacher_id]['pending'] += 1
        return Response(sorted(out.values(), key=lambda r: r['name'].lower()))

    @action(detail=False, methods=['post'], url_path='close-teacher')
    def close_teacher(self, request):
        """"Yopish" on a teacher's row: every open permission ends now."""
        if (denied := self._admin_only(request)):
            return denied
        n = JournalEditGrant.objects.filter(
            teacher_id=request.data.get('teacher'), status=JournalEditGrant.Status.APPROVED,
            expires_at__gt=timezone.now(),
        ).update(status=JournalEditGrant.Status.REVOKED)
        return Response({'closed': n})
