from django.urls import path

from . import views

urlpatterns = [
    path('', views.FeedView.as_view(), name='feed'),
    path('comments/<int:pk>/', views.CommentView.as_view(), name='feed-comment'),
    path('<int:pk>/', views.PostView.as_view(), name='feed-post'),
    path('<int:pk>/like/', views.LikeView.as_view(), name='feed-like'),
    path('<int:pk>/comments/', views.CommentsView.as_view(), name='feed-comments'),
]
