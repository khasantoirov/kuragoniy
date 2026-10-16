from django.contrib import admin

from .models import Notification, NotificationPreference


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'kind', 'title', 'created_at', 'read_at', 'archived_at')
    list_filter = ('kind',)
    search_fields = ('title', 'user__name', 'user__email')


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ('user', 'updated_at')
