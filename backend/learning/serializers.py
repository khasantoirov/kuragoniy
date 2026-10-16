from django.core.validators import URLValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from journal.models import JournalClass

from .models import Assignment, Attempt, Award, LessonMaterial, LessonReport, Question

_url_validator = URLValidator(schemes=['https', 'http'])

MAX_FORMULAS = 30
MAX_LINKS = 10


def _clean_str(value, limit, field):
    if not isinstance(value, str):
        raise serializers.ValidationError({field: "Matn bo'lishi kerak."})
    value = value.strip()
    if len(value) > limit:
        raise serializers.ValidationError({field: f"Ko'pi bilan {limit} belgi."})
    return value


def _clean_url(value, field):
    value = _clean_str(value, 500, field)
    if not value:
        return ''
    try:
        _url_validator(value)
    except DjangoValidationError:
        raise serializers.ValidationError({field: "Havola noto'g'ri (https://… bo'lishi kerak)."})
    return value


def validate_link_list(value, field='media_links'):
    if not isinstance(value, list):
        raise serializers.ValidationError({field: "Ro'yxat bo'lishi kerak."})
    if len(value) > MAX_LINKS:
        raise serializers.ValidationError({field: f"Ko'pi bilan {MAX_LINKS} ta havola."})
    return [u for u in (_clean_url(v, field) for v in value) if u]


class LessonMaterialSerializer(serializers.ModelSerializer):
    lesson_title = serializers.CharField(source='lesson.title', read_only=True)
    grade = serializers.CharField(source='lesson.grade', read_only=True)

    class Meta:
        model = LessonMaterial
        fields = [
            'lesson', 'lesson_title', 'grade', 'theory', 'formulas', 'video_url', 'extra_videos',
            'is_published', 'updated_at',
        ]
        read_only_fields = ['lesson', 'updated_at']

    def validate_theory(self, value):
        return _clean_str(value, 20000, 'theory')

    def validate_formulas(self, value):
        if not isinstance(value, list) or len(value) > MAX_FORMULAS:
            raise serializers.ValidationError(f"Ko'pi bilan {MAX_FORMULAS} ta formula.")
        out = []
        for f in value:
            if not isinstance(f, dict):
                raise serializers.ValidationError("Har bir formula {expr, desc} ko'rinishida bo'lsin.")
            expr = _clean_str(f.get('expr', ''), 200, 'formulas')
            desc = _clean_str(f.get('desc', ''), 300, 'formulas')
            if expr:
                out.append({'expr': expr, 'desc': desc})
        return out

    def validate_extra_videos(self, value):
        if not isinstance(value, list) or len(value) > MAX_LINKS:
            raise serializers.ValidationError(f"Ko'pi bilan {MAX_LINKS} ta video.")
        out = []
        for v in value:
            if not isinstance(v, dict):
                raise serializers.ValidationError("Har bir video {title, url} ko'rinishida bo'lsin.")
            url = _clean_url(v.get('url', ''), 'extra_videos')
            if url:
                out.append({'title': _clean_str(v.get('title', ''), 200, 'extra_videos'), 'url': url})
        return out


class QuestionSerializer(serializers.ModelSerializer):
    """Full question incl. answers — staff only."""

    class Meta:
        model = Question
        fields = [
            'id', 'lesson', 'assignment', 'audience', 'kind', 'topic', 'text', 'image_url', 'options',
            'correct', 'answer_value', 'tolerance_pct', 'unit', 'explanation', 'points', 'order', 'created_at',
        ]
        read_only_fields = ['created_at']

    def validate(self, attrs):
        inst = self.instance
        get = lambda k, d=None: attrs.get(k, getattr(inst, k, d) if inst else d)  # noqa: E731
        kind = get('kind', Question.Kind.TEST)
        text = _clean_str(get('text', ''), 2000, 'text')
        if not text:
            raise serializers.ValidationError({'text': 'Savol matni kerak.'})
        attrs['text'] = text
        options = get('options', []) or []
        correct = get('correct', []) or []

        if kind in (Question.Kind.TEST, Question.Kind.MULTI):
            if not isinstance(options, list) or not 2 <= len(options) <= 6:
                raise serializers.ValidationError({'options': "2 tadan 6 tagacha variant kiriting."})
            options = [_clean_str(o, 300, 'options') for o in options]
            if any(not o for o in options):
                raise serializers.ValidationError({'options': "Bo'sh variant bo'lmasin."})
            if not isinstance(correct, list) or not correct:
                raise serializers.ValidationError({'correct': "To'g'ri javobni belgilang."})
            if any(not isinstance(c, int) or not 0 <= c < len(options) for c in correct):
                raise serializers.ValidationError({'correct': "To'g'ri javob raqami noto'g'ri."})
            correct = sorted(set(correct))
            if kind == Question.Kind.TEST and len(correct) != 1:
                raise serializers.ValidationError({'correct': "Bitta to'g'ri javob bo'lishi kerak."})
            attrs['options'], attrs['correct'] = options, correct
        elif kind == Question.Kind.NUMBER:
            if get('answer_value') is None:
                raise serializers.ValidationError({'answer_value': "To'g'ri son javobni kiriting."})
            tol = get('tolerance_pct', 2.0)
            if tol is None or not 0 <= tol <= 50:
                raise serializers.ValidationError({'tolerance_pct': "Xatolik 0–50% oralig'ida bo'lsin."})
            attrs['options'], attrs['correct'] = [], []
        else:
            if not isinstance(correct, list) or not correct or len(correct) > 10:
                raise serializers.ValidationError({'correct': "1–10 ta qabul qilinadigan javob kiriting."})
            attrs['correct'] = [_clean_str(c, 200, 'correct') for c in correct if str(c).strip()]
            attrs['options'] = []
        if 'image_url' in attrs:
            attrs['image_url'] = _clean_url(attrs['image_url'], 'image_url')
        if 'explanation' in attrs:
            attrs['explanation'] = _clean_str(attrs['explanation'], 2000, 'explanation')
        points = get('points', 1)
        if not 1 <= (points or 1) <= 20:
            raise serializers.ValidationError({'points': "Ball 1–20 oralig'ida bo'lsin."})
        return attrs


class CustomQuestionInputSerializer(QuestionSerializer):
    class Meta(QuestionSerializer.Meta):
        fields = [f for f in QuestionSerializer.Meta.fields if f not in ('lesson', 'assignment', 'audience', 'created_at')]


class AssignmentSerializer(serializers.ModelSerializer):
    class_name = serializers.CharField(source='journal_class.name', read_only=True)
    lesson_title = serializers.CharField(source='lesson.title', read_only=True, default='')
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    custom_questions = CustomQuestionInputSerializer(many=True, required=False)
    question_count = serializers.SerializerMethodField()
    stats = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            'id', 'journal_class', 'class_name', 'lesson', 'lesson_title', 'teacher', 'teacher_name', 'title',
            'instructions', 'include_lesson_questions', 'due_at', 'max_attempts', 'show_answers', 'is_published',
            'created_at', 'updated_at', 'custom_questions', 'question_count', 'stats',
        ]
        read_only_fields = ['teacher', 'created_at', 'updated_at']

    def get_question_count(self, obj):
        n = obj.custom_questions.count()
        if obj.include_lesson_questions and obj.lesson_id:
            n += Question.objects.filter(
                lesson_id=obj.lesson_id, audience=Question.Audience.STUDENT, assignment__isnull=True,
            ).count()
        return n

    def get_stats(self, obj):
        return self.context.get('stats', {}).get(obj.id)

    def validate_title(self, value):
        return _clean_str(value, 255, 'title')

    def validate_instructions(self, value):
        return _clean_str(value, 5000, 'instructions')

    def validate_max_attempts(self, value):
        if not 1 <= value <= 10:
            raise serializers.ValidationError("1–10 oralig'ida.")
        return value

    def validate_journal_class(self, value):
        request = self.context['request']
        if value.teacher_id != request.user.id:
            raise serializers.ValidationError("Faqat o'z sinfingizga vazifa bera olasiz.")
        return value

    def validate(self, attrs):
        custom = attrs.get('custom_questions')
        lesson = attrs.get('lesson', getattr(self.instance, 'lesson', None))
        include = attrs.get('include_lesson_questions', getattr(self.instance, 'include_lesson_questions', True))
        if custom is not None and len(custom) > 50:
            raise serializers.ValidationError({'custom_questions': "Ko'pi bilan 50 ta savol."})
        has_lesson_q = bool(lesson and include and Question.objects.filter(
            lesson=lesson, audience=Question.Audience.STUDENT, assignment__isnull=True).exists())
        has_custom = bool(custom) or bool(self.instance and custom is None and self.instance.custom_questions.exists())
        if not has_lesson_q and not has_custom:
            raise serializers.ValidationError(
                "Vazifada savol yo'q: savollari bor darsni tanlang yoki o'zingiz savol qo'shing.")
        return attrs

    def _write_questions(self, assignment, questions):
        assignment.custom_questions.all().delete()
        for i, q in enumerate(questions):
            Question.objects.create(
                assignment=assignment, audience=Question.Audience.STUDENT, order=q.pop('order', i) or i,
                created_by=self.context['request'].user, **q,
            )

    def create(self, validated_data):
        questions = validated_data.pop('custom_questions', [])
        assignment = Assignment.objects.create(**validated_data)
        self._write_questions(assignment, questions)
        return assignment

    def update(self, instance, validated_data):
        questions = validated_data.pop('custom_questions', None)
        instance = super().update(instance, validated_data)
        if questions is not None:
            self._write_questions(instance, questions)
        return instance


class AttemptSummarySerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.name', read_only=True)
    lesson_title = serializers.CharField(source='lesson.title', read_only=True, default='')
    assignment_title = serializers.CharField(source='assignment.title', read_only=True, default='')

    class Meta:
        model = Attempt
        fields = [
            'id', 'user', 'user_name', 'kind', 'assignment', 'assignment_title', 'lesson', 'lesson_title',
            'started_at', 'submitted_at', 'is_late', 'score', 'max_score', 'percent', 'duration_sec',
        ]


class LessonReportSerializer(serializers.ModelSerializer):
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)
    class_name = serializers.CharField(source='journal_class.name', read_only=True, default='')
    lesson_title = serializers.CharField(source='lesson.title', read_only=True, default='')
    reviewed_by_name = serializers.CharField(source='reviewed_by.name', read_only=True, default='')
    readiness_percent = serializers.FloatField(source='readiness_attempt.percent', read_only=True, default=None)

    class Meta:
        model = LessonReport
        fields = [
            'id', 'teacher', 'teacher_name', 'journal_class', 'class_name', 'lesson', 'lesson_title', 'date',
            'topic', 'summary', 'methods', 'students_present', 'students_total', 'media_links',
            'readiness_attempt', 'readiness_percent', 'status', 'rating', 'review_comment', 'reviewed_by',
            'reviewed_by_name', 'reviewed_at', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'teacher', 'readiness_attempt', 'status', 'rating', 'review_comment', 'reviewed_by', 'reviewed_at',
            'created_at', 'updated_at',
        ]

    def validate_topic(self, value):
        return _clean_str(value, 255, 'topic')

    def validate_summary(self, value):
        value = _clean_str(value, 8000, 'summary')
        if len(value) < 20:
            raise serializers.ValidationError("Dars haqida kamida bir-ikki gap yozing (20+ belgi).")
        return value

    def validate_methods(self, value):
        return _clean_str(value, 4000, 'methods')

    def validate_media_links(self, value):
        return validate_link_list(value)

    def validate_journal_class(self, value):
        if value and value.teacher_id != self.context['request'].user.id:
            raise serializers.ValidationError("Bu sinf sizniki emas.")
        return value

    def validate(self, attrs):
        present = attrs.get('students_present')
        total = attrs.get('students_total')
        if present is not None and total is not None and present > total:
            raise serializers.ValidationError({'students_present': "Qatnashganlar umumiy sondan ko'p bo'lmasin."})
        return attrs


class ReportReviewSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5, required=False, allow_null=True)
    review_comment = serializers.CharField(required=False, allow_blank=True, max_length=4000)
    status = serializers.ChoiceField(choices=[LessonReport.Status.REVIEWED, LessonReport.Status.RETURNED])

    def validate(self, attrs):
        if attrs['status'] == LessonReport.Status.REVIEWED and not attrs.get('rating'):
            raise serializers.ValidationError({'rating': "Baholash uchun 1–5 ball tanlang."})
        return attrs


class AwardSerializer(serializers.ModelSerializer):
    recipient_name = serializers.CharField(source='recipient.name', read_only=True)
    recipient_role = serializers.CharField(source='recipient.role', read_only=True)
    granted_by_name = serializers.CharField(source='granted_by.name', read_only=True, default='')

    class Meta:
        model = Award
        fields = [
            'id', 'recipient', 'recipient_name', 'recipient_role', 'kind', 'title', 'reason', 'period',
            'granted_by', 'granted_by_name', 'created_at',
        ]
        read_only_fields = ['granted_by', 'created_at']

    def validate_title(self, value):
        return _clean_str(value, 200, 'title')

    def validate_reason(self, value):
        return _clean_str(value, 2000, 'reason')


class TeacherClassSerializer(serializers.ModelSerializer):
    invite_code = serializers.SerializerMethodField()
    invite_active = serializers.SerializerMethodField()
    auto_approve = serializers.SerializerMethodField()
    grade = serializers.SerializerMethodField()
    roster_count = serializers.IntegerField(read_only=True)
    account_count = serializers.IntegerField(read_only=True)
    pending_count = serializers.IntegerField(read_only=True)
    teacher_name = serializers.CharField(source='teacher.name', read_only=True)

    class Meta:
        model = JournalClass
        fields = [
            'id', 'name', 'school', 'teacher', 'teacher_name', 'grade', 'invite_code', 'invite_active',
            'auto_approve', 'roster_count', 'account_count', 'pending_count',
        ]

    def _invite(self, obj):
        return getattr(obj, 'invite', None)

    def get_invite_code(self, obj):
        inv = self._invite(obj)
        return inv.code if inv else None

    def get_invite_active(self, obj):
        inv = self._invite(obj)
        return bool(inv and inv.is_active)

    def get_auto_approve(self, obj):
        inv = self._invite(obj)
        return bool(inv and inv.auto_approve)

    def get_grade(self, obj):
        from .student_accounts import grade_from_class_name

        return grade_from_class_name(obj.name)
