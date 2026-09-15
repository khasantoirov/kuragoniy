from django.contrib import admin

from .models import LibraryItem


@admin.register(LibraryItem)
class LibraryItemAdmin(admin.ModelAdmin):
    list_display = ['title', 'kind', 'grade', 'updated_at']
    list_filter = ['kind', 'grade']
    search_fields = ['title']
