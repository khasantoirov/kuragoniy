from django.contrib import admin

from .models import PushSubscription


@admin.register(PushSubscription)
class PushSubscriptionAdmin(admin.ModelAdmin):
    list_display = ('user', 'endpoint', 'created_at')
    list_select_related = ('user',)
    search_fields = ('user__email', 'user__name', 'endpoint')
