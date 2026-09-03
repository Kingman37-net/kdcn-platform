from django.contrib import admin
from .models import Ticket

@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ('subject', 'client', 'status', 'created_at')
    search_fields = ('subject', 'client__company_name')
