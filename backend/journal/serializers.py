from rest_framework import serializers

from .models import AttendanceEntry, ClassDay, FinalGrade, GradeEntry, JournalClass, JournalEditGrant, Student


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ['id', 'full_name', 'order', 'active']


class JournalClassSerializer(serializers.ModelSerializer):
    students = StudentSerializer(many=True, read_only=True)
    partner_school_name = serializers.CharField(source='partner_school.name', read_only=True, default='')

    class Meta:
        model = JournalClass
        fields = ['id', 'school', 'partner_school', 'partner_school_name', 'name', 'created_at', 'students']
        read_only_fields = ['created_at']

    def validate(self, attrs):
        # Picking a partner school fills in the display name too; typing a
        # different free-text name clears a stale link so the auto-matcher
        # (schools/signals.py) can re-resolve it.
        school = attrs.get('partner_school')
        if school is not None:
            if school and not school.is_active:
                raise serializers.ValidationError({'partner_school': "Bu maktab faol emas."})
            if school:
                attrs['school'] = school.name
        elif 'school' in attrs and 'partner_school' not in attrs and self.instance is not None:
            if self.instance.partner_school_id and attrs['school'] != self.instance.school:
                attrs['partner_school'] = None
        return attrs


class ClassDaySerializer(serializers.ModelSerializer):
    class Meta:
        model = ClassDay
        fields = ['id', 'date', 'chorak', 'topic']


class FinalGradeSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinalGrade
        fields = ['id', 'student', 'chorak', 'mark']


class BulkMarkSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    mark = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)


class BulkAttendanceSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    status = serializers.ChoiceField(choices=AttendanceEntry.Status.choices, required=False, allow_null=True)


class BulkDaySerializer(serializers.Serializer):
    """Input shape for POST /journal/classes/{id}/bulk-marks/: save one
    class-day's topic + every student's mark/attendance in one request,
    matching the old grade-grid UI's 'mark the whole day at once' flow."""

    date = serializers.DateField()
    chorak = serializers.IntegerField(min_value=1, max_value=4)
    topic = serializers.CharField(required=False, allow_blank=True, default='')
    marks = BulkMarkSerializer(many=True, required=False, default=list)
    attendance = BulkAttendanceSerializer(many=True, required=False, default=list)


def class_label(journal_class) -> str:
    if journal_class is None:
        return 'Barcha sinflar'
    return f'{journal_class.school} | {journal_class.name}' if journal_class.school else journal_class.name


class EditGrantSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    class_label = serializers.SerializerMethodField()
    decided_by_name = serializers.CharField(source='decided_by.name', read_only=True, default='')
    active = serializers.SerializerMethodField()

    class Meta:
        model = JournalEditGrant
        fields = [
            'id', 'teacher', 'teacher_name', 'journal_class', 'class_label', 'date_from', 'date_to', 'reason',
            'status', 'created_at', 'decided_by_name', 'decided_at', 'note', 'expires_at', 'active',
        ]

    def get_class_label(self, obj):
        return class_label(obj.journal_class)

    def get_active(self, obj):
        from django.utils import timezone
        return obj.status == JournalEditGrant.Status.APPROVED and bool(obj.expires_at and obj.expires_at > timezone.now())


class GrantRequestSerializer(serializers.Serializer):
    """A teacher asking to reopen one past day of one class."""

    journal_class = serializers.IntegerField()
    date = serializers.DateField()
    reason = serializers.CharField(max_length=500, trim_whitespace=True)


class GrantCreateSerializer(serializers.Serializer):
    """An administrator opening days directly."""

    teacher = serializers.CharField(max_length=40)
    journal_class = serializers.IntegerField(required=False, allow_null=True)
    date_from = serializers.DateField()
    date_to = serializers.DateField(required=False, allow_null=True)
    hours = serializers.IntegerField(min_value=1, max_value=168, default=24)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')

    def validate(self, attrs):
        attrs['date_to'] = attrs.get('date_to') or attrs['date_from']
        if attrs['date_to'] < attrs['date_from']:
            raise serializers.ValidationError({'date_to': "Oxirgi sana boshlang'ich sanadan oldin bo'lmasin."})
        if (attrs['date_to'] - attrs['date_from']).days > 366:
            raise serializers.ValidationError({'date_to': "Oraliq bir yildan oshmasin."})
        return attrs


class GrantDecisionSerializer(serializers.Serializer):
    hours = serializers.IntegerField(min_value=1, max_value=168, default=24)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default='')
