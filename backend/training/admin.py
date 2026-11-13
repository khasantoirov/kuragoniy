from django.contrib import admin

from .models import Certificate, Course, CourseLesson, Enrollment, Module

admin.site.register(Course)
admin.site.register(Module)
admin.site.register(CourseLesson)
admin.site.register(Enrollment)
admin.site.register(Certificate)
