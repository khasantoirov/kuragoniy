from django.urls import path

from . import views

urlpatterns = [
    path('', views.KitsView.as_view(), name='kits'),
    path('lessons/<int:lesson_id>/', views.LessonKitsView.as_view(), name='kits-lesson'),
    path('schools/<int:school_id>/', views.SchoolKitsView.as_view(), name='kits-school'),
    path('requests/', views.KitRequestsView.as_view(), name='kits-requests'),
    path('requests/<int:pk>/', views.KitRequestView.as_view(), name='kits-request'),
    path('<int:pk>/', views.KitView.as_view(), name='kit'),
    path('<int:pk>/items/', views.KitItemsView.as_view(), name='kit-items'),
    path('<int:pk>/fill/', views.KitFillView.as_view(), name='kit-fill'),
]
