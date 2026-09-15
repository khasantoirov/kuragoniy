from django.contrib import admin

from .models import TimetableSlot


@admin.register(TimetableSlot)
class TimetableSlotAdmin(admin.ModelAdmin):
    list_display = ['teacher', 'day_index', 'period_index', 'sinf', 'xona']
    list_filter = ['day_index']
