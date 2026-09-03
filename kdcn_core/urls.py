from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/', include('django.contrib.auth.urls')),  # Login, logout, password reset
    path('', include('dashboard.urls')),
    path('client/', include('client_portal.urls')),
]
