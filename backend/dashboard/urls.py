from django.urls import path

from . import views

urlpatterns = [
    path('summary/', views.DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('mastery/', views.MasteryBreakdownView.as_view(), name='dashboard-mastery'),
]
