from django.urls import path

from . import monitoring, views

urlpatterns = [
    path('summary/', views.DashboardSummaryView.as_view(), name='dashboard-summary'),
    # the administration's overview: Bosh sahifa and Statistika › Monitoring
    path('monitoring/', monitoring.MonitoringView.as_view(), name='dashboard-monitoring'),
]
