from django.contrib import admin
from .models import Client

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'phone', 'created_at')
    search_fields = ('company_name', 'phone', 'address')
