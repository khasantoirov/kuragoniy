from django.contrib import admin

from .models import Assignment, Attempt, Award, ClassInvite, LessonMaterial, LessonReport, Question, StudentProfile


@admin.register(StudentProfile)
class StudentProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'journal_class', 'grade', 'created_at')
    search_fields = ('user__name', 'user__username')
    raw_id_fields = ('user', 'journal_class', 'roster_entry', 'created_by')


@admin.register(ClassInvite)
class ClassInviteAdmin(admin.ModelAdmin):
    list_display = ('journal_class', 'code', 'is_active', 'auto_approve')


@admin.register(LessonMaterial)
class LessonMaterialAdmin(admin.ModelAdmin):
    list_display = ('lesson', 'is_published', 'updated_at')
    list_filter = ('is_published',)


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('text', 'lesson', 'audience', 'kind', 'topic')
    list_filter = ('audience', 'kind', 'topic')
    search_fields = ('text',)


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('title', 'teacher', 'journal_class', 'due_at', 'is_published')


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ('user', 'kind', 'percent', 'submitted_at')
    list_filter = ('kind',)
    raw_id_fields = ('user', 'assignment', 'lesson')


@admin.register(LessonReport)
class LessonReportAdmin(admin.ModelAdmin):
    list_display = ('teacher', 'date', 'topic', 'status', 'rating')
    list_filter = ('status',)


@admin.register(Award)
class AwardAdmin(admin.ModelAdmin):
    list_display = ('title', 'recipient', 'kind', 'created_at')
