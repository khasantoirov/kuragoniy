from django.urls import path

from . import views

urlpatterns = [
    path('badges/', views.BadgesView.as_view(), name='achievements-badges'),
    path('leaderboard/', views.LeaderboardView.as_view(), name='achievements-leaderboard'),
]
