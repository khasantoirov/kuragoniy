from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ['email']
    list_display = ['email', 'name', 'role', 'approved', 'is_dev_superuser', 'is_staff']
    list_filter = ['role', 'approved', 'is_dev_superuser', 'is_staff']
    search_fields = ['email', 'name']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Profil', {'fields': ('name', 'photo', 'bday', 'phone')}),
        ('Rol', {'fields': ('role', 'approved', 'is_dev_superuser')}),
        ('Telegram', {'fields': ('telegram_linked', 'telegram_chat_id', 'telegram_username')}),
        ('Ruxsatlar', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'name', 'password1', 'password2'),
        }),
    )
