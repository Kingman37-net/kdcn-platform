from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from clients.models import Client
from projects.models import Project
from support.models import Ticket
from billing.models import Invoice

@login_required
def client_dashboard(request):
    try:
        client = Client.objects.get(user=request.user)
    except Client.DoesNotExist:
        return render(request, 'client_portal/no_client.html')
    
    context = {
        'client': client,
        'projects': Project.objects.filter(client=client),
        'tickets': Ticket.objects.filter(client=client),
        'invoices': Invoice.objects.filter(client=client),
    }
    return render(request, 'client_portal/dashboard.html', context)
