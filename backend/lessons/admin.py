from django.contrib import admin

from .models import EquipmentItem, Experiment, Lesson, QuarterLock


class ExperimentInline(admin.TabularInline):
    model = Experiment
    extra = 0


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ['title', 'grade', 'chorak', 'hafta', 'updated_at']
    list_filter = ['grade', 'chorak']
    search_fields = ['title']
    inlines = [ExperimentInline]


class EquipmentItemInline(admin.TabularInline):
    model = EquipmentItem
    extra = 0


# Django doesn't support nested inlines (Lesson -> Experiment ->
# EquipmentItem), so Experiment gets its own admin screen with the
# equipment inline, in addition to living as a read/add inline on
# LessonAdmin above.
@admin.register(Experiment)
class ExperimentAdmin(admin.ModelAdmin):
    list_display = ['name', 'lesson']
    search_fields = ['name']
    inlines = [EquipmentItemInline]


@admin.register(QuarterLock)
class QuarterLockAdmin(admin.ModelAdmin):
    list_display = ['chorak', 'is_open']
