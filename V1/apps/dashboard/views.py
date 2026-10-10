from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.db.models import Count
from clients.models import Client
from projects.models import Project
from services.models import Service
from support.models import Ticket
from billing.models import Invoice
from notifications.models import Notification

@login_required
def dashboard_home(request):
    client_count = Client.objects.count()
    project_count = Project.objects.count()
    service_count = Service.objects.count()
    ticket_count = Ticket.objects.filter(status='open').count()
    invoice_count = Invoice.objects.filter(is_paid=False).count()

    recent_clients = Client.objects.all().order_by('-created_at')[:5]
    recent_projects = Project.objects.all().order_by('-created_at')[:5]
    recent_tickets = Ticket.objects.all().order_by('-created_at')[:5]
    recent_notifications = Notification.objects.filter(user=request.user, is_read=False).order_by('-created_at')[:5]

    unread_notifications = Notification.objects.filter(user=request.user, is_read=False).count()

    context = {
        'client_count': client_count,
        'project_count': project_count,
        'service_count': service_count,
        'ticket_count': ticket_count,
        'invoice_count': invoice_count,
        'recent_clients': recent_clients,
        'recent_projects': recent_projects,
        'recent_tickets': recent_tickets,
        'recent_notifications': recent_notifications,
        'unread_notifications': unread_notifications,
        'user': request.user,
    }
    return render(request, 'dashboard/home.html', context)
