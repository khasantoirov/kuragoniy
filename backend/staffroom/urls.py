from django.urls import path

from . import views

urlpatterns = [
    path('day/', views.DayView.as_view(), name='staffroom-day'),
    path('plan/', views.PlanView.as_view(), name='staffroom-plan'),
    path('guests/', views.GuestRequestsView.as_view(), name='staffroom-guests'),
    path('guests/<int:pk>/', views.GuestRequestView.as_view(), name='staffroom-guest'),
]
