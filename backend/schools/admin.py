from django.contrib import admin

from .models import School, SchoolTeacher


class SchoolTeacherInline(admin.TabularInline):
    model = SchoolTeacher
    extra = 0
    raw_id_fields = ('teacher',)


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ('name', 'district', 'director', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'district', 'director')
    inlines = [SchoolTeacherInline]
