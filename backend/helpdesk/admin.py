from django.contrib import admin

from .models import FaqItem, Ticket, TicketMessage

admin.site.register(FaqItem)
admin.site.register(Ticket)
admin.site.register(TicketMessage)
