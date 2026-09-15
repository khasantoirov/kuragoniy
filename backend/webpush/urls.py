from django.urls import path

from . import views

urlpatterns = [
    path('vapid-public-key/', views.VapidPublicKeyView.as_view(), name='push-vapid-key'),
    path('subscribe/', views.PushSubscribeView.as_view(), name='push-subscribe'),
    path('unsubscribe/', views.PushUnsubscribeView.as_view(), name='push-unsubscribe'),
]
