"""Games: a live classroom quiz (teacher hosts on the board, students
answer from their phones in real time) and score tracking for the
single-player physics mini-games that run entirely in the browser."""

from django.conf import settings
from django.db import models

from learning.models import GRADE_CHOICES


class Quiz(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='quizzes', on_delete=models.CASCADE)
    title = models.CharField(max_length=200)
    grade = models.CharField(max_length=5, choices=GRADE_CHOICES, null=True, blank=True)
    lesson = models.ForeignKey('lessons.Lesson', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title


class QuizQuestion(models.Model):
    quiz = models.ForeignKey(Quiz, related_name='questions', on_delete=models.CASCADE)
    order = models.PositiveSmallIntegerField(default=0)
    text = models.CharField(max_length=500)
    image_url = models.URLField(max_length=500, blank=True)
    options = models.JSONField(default=list)  # 2..4 strings
    correct = models.PositiveSmallIntegerField(default=0)
    time_limit = models.PositiveSmallIntegerField(default=20)  # seconds
    points = models.PositiveIntegerField(default=1000)

    class Meta:
        ordering = ['order', 'id']


class GameSession(models.Model):
    class Status(models.TextChoices):
        LOBBY = 'lobby', 'Kutish'
        QUESTION = 'question', 'Savol'
        REVEAL = 'reveal', 'Javob'
        FINISHED = 'finished', 'Tugadi'

    quiz = models.ForeignKey(Quiz, related_name='sessions', on_delete=models.CASCADE)
    host = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='hosted_games', on_delete=models.CASCADE)
    # Cleared when the game finishes so the 6-digit space never runs out.
    pin = models.CharField(max_length=8, unique=True, null=True, blank=True)
    # Optional: only students of this class may join.
    journal_class = models.ForeignKey('journal.JournalClass', related_name='+', null=True, blank=True, on_delete=models.SET_NULL)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.LOBBY)
    current_index = models.SmallIntegerField(default=-1)
    question_started_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']


class GamePlayer(models.Model):
    session = models.ForeignKey(GameSession, related_name='players', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='game_players', on_delete=models.CASCADE)
    nickname = models.CharField(max_length=60)
    score = models.IntegerField(default=0)
    streak = models.PositiveSmallIntegerField(default=0)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('session', 'user')
        ordering = ['-score', 'joined_at']


class GameAnswer(models.Model):
    player = models.ForeignKey(GamePlayer, related_name='answers', on_delete=models.CASCADE)
    question = models.ForeignKey(QuizQuestion, related_name='+', on_delete=models.CASCADE)
    choice = models.PositiveSmallIntegerField()
    is_correct = models.BooleanField(default=False)
    points = models.IntegerField(default=0)
    elapsed_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('player', 'question')


class MiniGameScore(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='mini_game_scores', on_delete=models.CASCADE)
    game = models.CharField(max_length=32)
    score = models.PositiveIntegerField(default=0)
    correct = models.PositiveSmallIntegerField(default=0)
    total = models.PositiveSmallIntegerField(default=0)
    duration_sec = models.PositiveIntegerField(default=0)
    played_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-played_at']
        indexes = [models.Index(fields=['game', '-score'])]
