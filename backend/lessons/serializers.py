import os

from rest_framework import serializers

from .models import Experiment, Lesson, QuarterLock


class ExperimentSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = Experiment
        fields = [
            'id', 'order', 'name', 'name_ru', 'name_en',
            'desc', 'desc_ru', 'desc_en',
            'materials', 'materials_ru', 'materials_en',
            'steps', 'steps_ru', 'steps_en',
            'concepts', 'concepts_ru', 'concepts_en',
            'minutes', 'safety', 'safety_ru', 'safety_en', 'image', 'video',
        ]
        read_only_fields = [
            'name_ru', 'name_en', 'desc_ru', 'desc_en',
            'materials_ru', 'materials_en', 'steps_ru', 'steps_en',
            'concepts_ru', 'concepts_en',
            'safety_ru', 'safety_en',
        ]


class QuarterLockSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuarterLock
        fields = ['chorak', 'is_open']


class LessonSerializer(serializers.ModelSerializer):
    experiments = ExperimentSerializer(many=True, required=False)
    file_name = serializers.SerializerMethodField()
    file_size = serializers.SerializerMethodField()

    class Meta:
        model = Lesson
        fields = [
            'id', 'title', 'title_ru', 'title_en', 'grade', 'chorak', 'hafta',
            'goal', 'goal_ru', 'goal_en', 'file_url', 'file', 'file_name',
            'file_size', 'updated_at', 'translated_at', 'experiments',
        ]
        # `file` is written only via LessonViewSet.upload_file (a dedicated
        # multipart action) — see the model field's comment for why it
        # can't share this serializer's normal JSON create/update path.
        read_only_fields = ['updated_at', 'translated_at', 'file', 'file_name', 'file_size']

    def get_file_name(self, obj):
        return os.path.basename(obj.file.name) if obj.file else None

    def get_file_size(self, obj):
        if not obj.file:
            return None
        try:
            return obj.file.size
        except (OSError, ValueError):
            return None

    def create(self, validated_data):
        experiments_data = validated_data.pop('experiments', [])
        lesson = Lesson.objects.create(**validated_data)
        self._sync_experiments(lesson, experiments_data)
        return lesson

    def update(self, instance, validated_data):
        experiments_data = validated_data.pop('experiments', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if experiments_data is not None:
            self._sync_experiments(instance, experiments_data)
        return instance

    @staticmethod
    def _sync_experiments(lesson: Lesson, experiments_data):
        """Whole-collection replace, matching the old Firestore doc's
        embedded-array-of-experiments semantics: the incoming list is the
        full new state, so anything not present is deleted."""
        keep_ids = []
        for i, exp_data in enumerate(experiments_data):
            exp_data = {**exp_data, 'lesson': lesson, 'order': i}
            exp_id = exp_data.pop('id', None)
            if exp_id and lesson.experiments.filter(id=exp_id).exists():
                lesson.experiments.filter(id=exp_id).update(**exp_data)
                keep_ids.append(exp_id)
            else:
                obj = Experiment.objects.create(**exp_data)
                keep_ids.append(obj.id)
        lesson.experiments.exclude(id__in=keep_ids).delete()
