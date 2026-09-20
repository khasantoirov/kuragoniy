from django.urls import path

from . import views

urlpatterns = [
    path('', views.GlobalSearchView.as_view(), name='global-search'),
]
