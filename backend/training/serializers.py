from urllib.parse import urlparse

from rest_framework import serializers

from learning.serializers import CustomQuestionInputSerializer

from .models import Certificate, Course, CourseLesson, Module
from .services import QUESTION_FIELDS

MAX_QUESTIONS = 100
MAX_LESSONS = 40
MAX_LINKS = 10


def _url(value, field):
    value = (value or '').strip()
    if not value:
        return ''
    if urlparse(value).scheme not in ('http', 'https'):
        raise serializers.ValidationError({field: "Havola http:// yoki https:// bilan boshlansin."})
    return value[:500]


class CourseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Course
        fields = ['id', 'title', 'summary', 'hours', 'audience', 'subject', 'pass_percent', 'is_published', 'order',
                  'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Kurs nomini kiriting.')
        return value

    def validate_pass_percent(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError("O'tish chegarasi 1–100% oralig'ida bo'lsin.")
        return value

    def validate_hours(self, value):
        if value > 1000:
            raise serializers.ValidationError("Soatlar soni juda katta.")
        return value


class LessonInputSerializer(serializers.Serializer):
    id = serializers.IntegerField(required=False, allow_null=True)
    title = serializers.CharField(max_length=200)
    body = serializers.CharField(allow_blank=True, required=False, max_length=50000)
    video_url = serializers.CharField(allow_blank=True, required=False, max_length=500)
    links = serializers.ListField(child=serializers.DictField(), required=False, max_length=MAX_LINKS)

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Dars nomini kiriting.')
        return value

    def validate_video_url(self, value):
        return _url(value, 'video_url')

    def validate_links(self, value):
        out = []
        for row in value:
            url = _url(row.get('url'), 'links')
            if url:
                out.append({'title': str(row.get('title') or '').strip()[:200], 'url': url})
        return out


class ModuleInputSerializer(serializers.Serializer):
    """A module saved whole: its title, lessons (kept by id, new ones
    added, missing ones removed) and test."""

    title = serializers.CharField(max_length=200)
    test_size = serializers.IntegerField(min_value=0, max_value=MAX_QUESTIONS, required=False, default=0)
    lessons = LessonInputSerializer(many=True, required=False)
    questions = serializers.ListField(child=serializers.DictField(), required=False, max_length=MAX_QUESTIONS)

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Modul nomini kiriting.')
        return value

    def validate_lessons(self, value):
        if len(value) > MAX_LESSONS:
            raise serializers.ValidationError(f"Bir modulda {MAX_LESSONS} tagacha dars bo'ladi.")
        return value

    def validate_questions(self, value):
        out = []
        for i, raw in enumerate(value):
            s = CustomQuestionInputSerializer(data=raw)
            if not s.is_valid():
                field, errs = next(iter(s.errors.items()))
                msg = errs[0] if isinstance(errs, list) else errs
                raise serializers.ValidationError(f'{i + 1}-savol: {msg}')
            data = s.validated_data
            out.append({k: data[k] for k in QUESTION_FIELDS if k in data})
        return out


class LessonSerializer(serializers.ModelSerializer):
    class Meta:
        model = CourseLesson
        fields = ['id', 'title', 'body', 'video_url', 'links', 'order']


class CertificateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Certificate
        fields = ['id', 'user', 'course', 'course_title', 'name', 'hours', 'percent', 'number', 'code', 'issued_at']


def module_editor_dict(m: Module) -> dict:
    """Everything an editor needs — answers included (admins only)."""
    return {
        'id': m.id, 'title': m.title, 'order': m.order, 'test_size': m.test_size,
        'questions': m.questions or [],
        'lessons': LessonSerializer(m.lessons.all(), many=True).data,
    }
