from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('', views.NotificationViewSet, basename='notification')

urlpatterns = [
    path('prefs/', views.PreferencesView.as_view(), name='notification-prefs'),
    *router.urls,
]
