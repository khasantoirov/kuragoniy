from rest_framework import serializers

from .models import AttendanceEntry, ClassDay, FinalGrade, GradeEntry, JournalClass, Student


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
