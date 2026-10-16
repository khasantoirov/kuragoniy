from django.contrib import admin

from .models import GameSession, MiniGameScore, Quiz


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ('title', 'owner', 'grade', 'updated_at')


@admin.register(GameSession)
class GameSessionAdmin(admin.ModelAdmin):
    list_display = ('quiz', 'host', 'status', 'pin', 'created_at')


@admin.register(MiniGameScore)
class MiniGameScoreAdmin(admin.ModelAdmin):
    list_display = ('user', 'game', 'score', 'played_at')
