from django.urls import path
from . import views

app_name = 'client_portal'

urlpatterns = [
    path('', views.client_dashboard, name='dashboard'),
]
