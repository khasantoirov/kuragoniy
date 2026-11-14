from django.urls import path

from . import views

urlpatterns = [
    path('faq/', views.FaqView.as_view(), name='help-faq'),
    path('faq/<int:pk>/', views.FaqItemView.as_view(), name='help-faq-item'),
    path('tickets/', views.TicketsView.as_view(), name='help-tickets'),
    path('tickets/<int:pk>/', views.TicketView.as_view(), name='help-ticket'),
    path('tickets/<int:pk>/messages/', views.TicketMessagesView.as_view(), name='help-ticket-messages'),
]
