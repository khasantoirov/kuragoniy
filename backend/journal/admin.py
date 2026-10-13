from django.contrib import admin

from .models import AttendanceEntry, ClassDay, FinalGrade, GradeEntry, JournalClass, Student


class StudentInline(admin.TabularInline):
    model = Student
    extra = 0


@admin.register(JournalClass)
class JournalClassAdmin(admin.ModelAdmin):
    list_display = ['name', 'teacher', 'school', 'partner_school', 'created_at']
    list_filter = ['partner_school']
    inlines = [StudentInline]


admin.site.register(ClassDay)
admin.site.register(GradeEntry)
admin.site.register(AttendanceEntry)
admin.site.register(FinalGrade)
