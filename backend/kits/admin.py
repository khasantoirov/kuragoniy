from django.contrib import admin

from .models import Kit, KitItem, KitRequest, SchoolKit

admin.site.register(Kit)
admin.site.register(KitItem)
admin.site.register(SchoolKit)
admin.site.register(KitRequest)
