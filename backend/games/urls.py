from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('quizzes', views.QuizViewSet, basename='game-quiz')
router.register('sessions', views.GameSessionViewSet, basename='game-session')

# play/ and mini/ are the student-reachable prefixes (common/authentication.py).
urlpatterns = [
    path('play/join/', views.JoinGameView.as_view(), name='game-join'),
    path('play/<int:session_id>/state/', views.PlayerStateView.as_view(), name='game-player-state'),
    path('play/<int:session_id>/answer/', views.PlayerAnswerView.as_view(), name='game-player-answer'),
    path('mini/scores/', views.MiniScoreView.as_view(), name='game-mini-score'),
    path('mini/leaderboard/', views.MiniLeaderboardView.as_view(), name='game-mini-leaderboard'),
    path('mini/my-best/', views.MiniMyBestView.as_view(), name='game-mini-my-best'),
    *router.urls,
]
