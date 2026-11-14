from django.contrib import admin

from .models import GuestRequest, PlannedLesson

admin.site.register(PlannedLesson)
admin.site.register(GuestRequest)
