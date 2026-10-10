from django.contrib import admin
from .models import Invoice

@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'client', 'amount', 'is_paid', 'due_date')
    search_fields = ('invoice_number', 'client__company_name')
