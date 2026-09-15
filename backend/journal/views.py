from django.db import transaction
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsApproved

from .models import AttendanceEntry, ClassDay, FinalGrade, GradeEntry, JournalClass, Student
from .serializers import (
    BulkDaySerializer,
    ClassDaySerializer,
    FinalGradeSerializer,
    JournalClassSerializer,
    StudentSerializer,
)


class JournalClassViewSet(viewsets.ModelViewSet):
    """Owner CRUD; admins get cross-teacher read via ?teacher=<id> —
    mirrors firestore.rules' journals/{uid}/classes/{classId} rule."""

    serializer_class = JournalClassSerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        user = self.request.user
        teacher_id = self.request.query_params.get('teacher')
        qs = JournalClass.objects.prefetch_related('students')
        if teacher_id and user.is_admin:
            return qs.filter(teacher_id=teacher_id)
        return qs.filter(teacher=user)

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)

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
        })

    @action(detail=True, methods=['post'], url_path='bulk-marks')
    def bulk_marks(self, request, pk=None):
        journal_class = self.get_object()
        serializer = BulkDaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        with transaction.atomic():
            day, _ = ClassDay.objects.update_or_create(
                journal_class=journal_class,
                date=data['date'],
                defaults={'chorak': data['chorak'], 'topic': data.get('topic', '')},
            )

            for entry in data.get('marks', []):
                if entry.get('mark') is None:
                    GradeEntry.objects.filter(day=day, student_id=entry['student_id']).delete()
                else:
                    GradeEntry.objects.update_or_create(
                        day=day, student_id=entry['student_id'],
                        defaults={'mark': entry['mark']},
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
        date = request.data.get('date')
        ClassDay.objects.filter(journal_class=journal_class, date=date).delete()
        return Response(self.grid(request, pk=pk).data)

    @action(detail=True, methods=['post'], url_path='set-final')
    def set_final(self, request, pk=None):
        journal_class = self.get_object()
        student_id = request.data.get('student_id')
        chorak = request.data.get('chorak')
        mark = request.data.get('mark')
        student = journal_class.students.get(id=student_id)
        if mark:
            FinalGrade.objects.update_or_create(student=student, chorak=chorak, defaults={'mark': mark})
        else:
            FinalGrade.objects.filter(student=student, chorak=chorak).delete()
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


class FinalGradeViewSet(viewsets.ModelViewSet):
    serializer_class = FinalGradeSerializer
    permission_classes = [IsApproved]

    def get_queryset(self):
        return FinalGrade.objects.filter(student__journal_class__teacher=self.request.user)
