from django.contrib import admin

from .models import Experiment, Lesson, LessonPoster, QuarterLock


class ExperimentInline(admin.TabularInline):
    model = Experiment
    extra = 0


@admin.register(Lesson)
class LessonAdmin(admin.ModelAdmin):
    list_display = ['title', 'grade', 'chorak', 'hafta', 'cat', 'updated_at']
    list_filter = ['grade', 'chorak', 'cat']
    search_fields = ['title']
    inlines = [ExperimentInline]


@admin.register(QuarterLock)
class QuarterLockAdmin(admin.ModelAdmin):
    list_display = ['chorak', 'is_open']


@admin.register(LessonPoster)
class LessonPosterAdmin(admin.ModelAdmin):
    list_display = ['grade', 'hafta', 'topic', 'created_at']
    list_filter = ['grade']
