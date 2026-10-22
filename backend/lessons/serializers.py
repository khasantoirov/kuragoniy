import os

from django.db import transaction
from rest_framework import serializers

from common.uploads import delete_file_field

from .models import EquipmentItem, EquipmentSheet, Experiment, Lesson, QuarterLock


class EquipmentItemSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    image_name = serializers.SerializerMethodField()
    image_size = serializers.SerializerMethodField()

    class Meta:
        model = EquipmentItem
        fields = ['id', 'order', 'name', 'name_ru', 'name_en', 'quantity', 'image', 'image_name', 'image_size']
        # `image` is written only via EquipmentItemViewSet.upload_image — see
        # the model field's comment for why (needs a real persisted id first).
        read_only_fields = ['name_ru', 'name_en', 'image', 'image_name', 'image_size']

    def get_image_name(self, obj):
        return os.path.basename(obj.image.name) if obj.image else None

    def get_image_size(self, obj):
        if not obj.image:
            return None
        try:
            return obj.image.size
        except (OSError, ValueError):
            return None


class ExperimentSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    equipment_items = EquipmentItemSerializer(many=True, required=False)

    class Meta:
        model = Experiment
        fields = [
            'id', 'order', 'name', 'name_ru', 'name_en',
            'desc', 'desc_ru', 'desc_en',
            'equipment_items',
            'steps', 'steps_ru', 'steps_en',
            'concepts', 'concepts_ru', 'concepts_en',
            'minutes', 'safety', 'safety_ru', 'safety_en', 'image', 'video',
        ]
        read_only_fields = [
            'name_ru', 'name_en', 'desc_ru', 'desc_en',
            'steps_ru', 'steps_en',
            'concepts_ru', 'concepts_en',
            'safety_ru', 'safety_en',
        ]


class QuarterLockSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuarterLock
        fields = ['chorak', 'is_open']


class EquipmentSheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = EquipmentSheet
        fields = ['id', 'grade', 'hafta', 'title', 'image', 'created_at']
        read_only_fields = ['id', 'created_at']


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

    # One transaction for the lesson and its experiments: an edit lands
    # whole or not at all, and the on-commit lessons backup
    # (lessons/signals.py) only runs once the experiments are written too.
    @transaction.atomic
    def create(self, validated_data):
        experiments_data = validated_data.pop('experiments', [])
        lesson = Lesson.objects.create(**validated_data)
        self._sync_experiments(lesson, experiments_data)
        return lesson

    @transaction.atomic
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
            equipment_data = exp_data.pop('equipment_items', None)
            if exp_id and lesson.experiments.filter(id=exp_id).exists():
                lesson.experiments.filter(id=exp_id).update(**exp_data)
                experiment = lesson.experiments.get(id=exp_id)
            else:
                experiment = Experiment.objects.create(**exp_data)
            keep_ids.append(experiment.id)
            if equipment_data is not None:
                LessonSerializer._sync_equipment_items(experiment, equipment_data)

        to_delete = lesson.experiments.exclude(id__in=keep_ids)
        for exp in to_delete:
            for item in exp.equipment_items.all():
                delete_file_field(item, 'image')
        to_delete.delete()

    @staticmethod
    def _sync_equipment_items(experiment: Experiment, items_data):
        """Same whole-collection replace-by-id as _sync_experiments, one
        level deeper. `image` never appears in items_data (read_only on
        EquipmentItemSerializer, so DRF strips it from validated_data),
        so an existing item's photo is untouched by a plain name/quantity
        edit — it's only ever changed via the dedicated upload/remove-image
        actions."""
        keep_ids = []
        for i, item_data in enumerate(items_data):
            item_data = {**item_data, 'experiment': experiment, 'order': i}
            item_id = item_data.pop('id', None)
            if item_id and experiment.equipment_items.filter(id=item_id).exists():
                experiment.equipment_items.filter(id=item_id).update(**item_data)
            else:
                obj = EquipmentItem.objects.create(**item_data)
                item_id = obj.id
            keep_ids.append(item_id)

        to_delete = experiment.equipment_items.exclude(id__in=keep_ids)
        for item in to_delete:
            delete_file_field(item, 'image')
        to_delete.delete()
