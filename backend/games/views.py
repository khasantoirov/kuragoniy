"""Live quiz (host + player) and mini-game score endpoints.

Every state transition is a plain REST call; after each one the server
pings the session's Channels group, and connected clients simply refetch
their own (per-user) state. Clients without a socket poll instead. Answer
timing is measured on the server from question_started_at — the client
never reports how fast it was."""

import secrets
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db import IntegrityError, transaction
from django.db.models import Count, F, Max
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsApproved, IsTeacher
from common.throttling import GameAnswerRateThrottle
from journal.models import JournalClass
from learning.models import Question

from .models import GameAnswer, GamePlayer, GameSession, MiniGameScore, Quiz, QuizQuestion

ANSWER_GRACE_SECONDS = 1.5
MINI_GAMES = {
    # game key -> max points per correct answer (incl. speed bonus)
    'units': 150,
    'formulas': 150,
    'truefalse': 150,
    'convert': 200,
}


def broadcast(session_id: int) -> None:
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(f'game_{session_id}', {'type': 'game.changed'})
    except Exception:
        pass  # clients fall back to polling


# ── Quizzes ───────────────────────────────────────────────────────────

class QuizQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizQuestion
        fields = ['id', 'order', 'text', 'image_url', 'options', 'correct', 'time_limit', 'points']
        read_only_fields = ['id']

    def validate(self, attrs):
        text = str(attrs.get('text', '')).strip()
        if not text:
            raise serializers.ValidationError({'text': 'Savol matni kerak.'})
        options = attrs.get('options') or []
        if not isinstance(options, list) or not 2 <= len(options) <= 4:
            raise serializers.ValidationError({'options': "2–4 ta variant kiriting."})
        options = [str(o).strip()[:120] for o in options]
        if any(not o for o in options):
            raise serializers.ValidationError({'options': "Bo'sh variant bo'lmasin."})
        if not 0 <= attrs.get('correct', 0) < len(options):
            raise serializers.ValidationError({'correct': "To'g'ri javobni belgilang."})
        if not 5 <= attrs.get('time_limit', 20) <= 120:
            raise serializers.ValidationError({'time_limit': "Vaqt 5–120 soniya."})
        if not 100 <= attrs.get('points', 1000) <= 2000:
            raise serializers.ValidationError({'points': "Ball 100–2000."})
        attrs['text'], attrs['options'] = text, options
        return attrs


class QuizSerializer(serializers.ModelSerializer):
    questions = QuizQuestionSerializer(many=True, required=False)
    owner_name = serializers.CharField(source='owner.name', read_only=True)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ['id', 'title', 'grade', 'lesson', 'owner', 'owner_name', 'created_at', 'updated_at', 'questions', 'question_count']
        read_only_fields = ['owner', 'created_at', 'updated_at']

    def get_question_count(self, obj):
        return obj.questions.count()

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Nom kerak.")
        return value

    def validate_questions(self, value):
        if len(value) > 60:
            raise serializers.ValidationError("Ko'pi bilan 60 ta savol.")
        return value

    def _write(self, quiz, questions):
        quiz.questions.all().delete()
        QuizQuestion.objects.bulk_create([
            QuizQuestion(quiz=quiz, **{**q, 'order': i}) for i, q in enumerate(questions)
        ])

    def create(self, validated_data):
        questions = validated_data.pop('questions', [])
        quiz = Quiz.objects.create(**validated_data)
        self._write(quiz, questions)
        return quiz

    def update(self, instance, validated_data):
        questions = validated_data.pop('questions', None)
        instance = super().update(instance, validated_data)
        if questions is not None:
            self._write(instance, questions)
        return instance


class QuizViewSet(viewsets.ModelViewSet):
    serializer_class = QuizSerializer

    def get_permissions(self):
        if self.request.method in SAFE_METHODS:
            return [IsApproved()]
        return [IsTeacher()]

    def get_queryset(self):
        user = self.request.user
        qs = Quiz.objects.select_related('owner').prefetch_related('questions')
        if user.is_oversight and self.request.query_params.get('all'):
            return qs
        return qs.filter(owner=user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    @action(detail=True, methods=['post'], url_path='import-lesson')
    def import_lesson(self, request, pk=None):
        """Copies the single-answer test questions of a lesson's student
        bank into this quiz (only those with 2–4 options fit the board)."""
        quiz = self.get_object()
        lesson_id = request.data.get('lesson')
        bank = Question.objects.filter(
            lesson_id=lesson_id, kind=Question.Kind.TEST, assignment__isnull=True,
        ).order_by('order', 'id')
        start = quiz.questions.count()
        added = 0
        for q in bank:
            opts = [str(o)[:120] for o in (q.options or [])]
            if not 2 <= len(opts) <= 4 or not q.correct:
                continue
            QuizQuestion.objects.create(
                quiz=quiz, order=start + added, text=q.text[:500], image_url=q.image_url,
                options=opts, correct=q.correct[0],
            )
            added += 1
            if start + added >= 60:
                break
        return Response({'added': added, 'quiz': QuizSerializer(quiz).data})


# ── Live sessions: host side ──────────────────────────────────────────

def _new_pin() -> str:
    while True:
        pin = f'{secrets.randbelow(900000) + 100000}'
        if not GameSession.objects.filter(pin=pin).exists():
            return pin


def _questions(session):
    return list(session.quiz.questions.all())


def _time_left(session, question) -> float:
    if session.status != GameSession.Status.QUESTION or not session.question_started_at:
        return 0
    elapsed = (timezone.now() - session.question_started_at).total_seconds()
    return max(0.0, question.time_limit - elapsed)


def _leaderboard(session, limit=10):
    return [
        {'player': p.id, 'nickname': p.nickname, 'score': p.score, 'rank': i}
        for i, p in enumerate(session.players.order_by('-score', 'joined_at')[:limit], start=1)
    ]


def host_state(session) -> dict:
    questions = _questions(session)
    q = questions[session.current_index] if 0 <= session.current_index < len(questions) else None
    data = {
        'id': session.id, 'pin': session.pin, 'status': session.status, 'quiz_title': session.quiz.title,
        'total': len(questions), 'index': session.current_index,
        'players': [{'id': p.id, 'nickname': p.nickname, 'score': p.score} for p in session.players.order_by('joined_at')],
        'leaderboard': _leaderboard(session),
        'class_name': session.journal_class.name if session.journal_class else '',
    }
    if q:
        answers = GameAnswer.objects.filter(player__session=session, question=q)
        counts = dict(answers.values('choice').annotate(n=Count('id')).values_list('choice', 'n'))
        data['question'] = {
            'text': q.text, 'image_url': q.image_url, 'options': q.options, 'correct': q.correct,
            'time_limit': q.time_limit, 'time_left': _time_left(session, q),
        }
        data['answered'] = answers.count()
        data['option_counts'] = [counts.get(i, 0) for i in range(len(q.options))]
    return data


class GameSessionViewSet(viewsets.GenericViewSet):
    permission_classes = [IsTeacher]

    def get_queryset(self):
        return GameSession.objects.filter(host=self.request.user).select_related('quiz', 'journal_class')

    def list(self, request):
        rows = self.get_queryset()[:30]
        return Response([
            {'id': s.id, 'quiz_title': s.quiz.title, 'status': s.status, 'pin': s.pin, 'created_at': s.created_at,
             'players': s.players.count()}
            for s in rows
        ])

    def create(self, request):
        quiz = get_object_or_404(Quiz, pk=request.data.get('quiz'), owner=request.user)
        if not quiz.questions.exists():
            raise ValidationError({'detail': "Viktorinada savol yo'q."})
        jc = None
        if request.data.get('journal_class'):
            jc = get_object_or_404(JournalClass, pk=request.data.get('journal_class'), teacher=request.user)
        # One live game per host at a time.
        GameSession.objects.filter(host=request.user).exclude(status=GameSession.Status.FINISHED).update(
            status=GameSession.Status.FINISHED, pin=None, finished_at=timezone.now())
        session = GameSession.objects.create(quiz=quiz, host=request.user, pin=_new_pin(), journal_class=jc)
        return Response(host_state(session), status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        return Response(host_state(self.get_object()))

    @action(detail=True, methods=['post'])
    def next(self, request, pk=None):
        session = self.get_object()
        if session.status == GameSession.Status.FINISHED:
            raise ValidationError({'detail': "O'yin tugagan."})
        total = session.quiz.questions.count()
        if session.status == GameSession.Status.QUESTION:
            self._close_question(session)
        if session.current_index + 1 >= total:
            return self.finish(request, pk)
        session.current_index += 1
        session.status = GameSession.Status.QUESTION
        session.question_started_at = timezone.now()
        session.save(update_fields=['current_index', 'status', 'question_started_at'])
        broadcast(session.id)
        return Response(host_state(session))

    def _close_question(self, session):
        questions = _questions(session)
        if 0 <= session.current_index < len(questions):
            q = questions[session.current_index]
            answered = GameAnswer.objects.filter(question=q, player__session=session).values_list('player_id', flat=True)
            session.players.exclude(id__in=list(answered)).update(streak=0)

    @action(detail=True, methods=['post'])
    def reveal(self, request, pk=None):
        session = self.get_object()
        if session.status == GameSession.Status.QUESTION:
            self._close_question(session)
            session.status = GameSession.Status.REVEAL
            session.save(update_fields=['status'])
            broadcast(session.id)
        return Response(host_state(session))

    @action(detail=True, methods=['post'])
    def finish(self, request, pk=None):
        session = self.get_object()
        if session.status != GameSession.Status.FINISHED:
            session.status = GameSession.Status.FINISHED
            session.finished_at = timezone.now()
            session.save(update_fields=['status', 'finished_at'])
            broadcast(session.id)
            # Keep the pin for a moment so already-connected players can
            # still load the final standings; freed on the next host game
            # (create() above) or by this cleanup of old sessions.
            GameSession.objects.filter(
                status=GameSession.Status.FINISHED, finished_at__lt=timezone.now() - timedelta(hours=1),
            ).update(pin=None)
        return Response(host_state(session))

    @action(detail=True, methods=['post'])
    def kick(self, request, pk=None):
        session = self.get_object()
        session.players.filter(pk=request.data.get('player')).delete()
        broadcast(session.id)
        return Response(host_state(session))


# ── Live sessions: player side ────────────────────────────────────────

def _player_or_403(request, session_id) -> GamePlayer:
    player = GamePlayer.objects.select_related('session', 'session__quiz').filter(
        session_id=session_id, user=request.user).first()
    if not player:
        raise PermissionDenied("Siz bu o'yinga qo'shilmagansiz.")
    return player


def player_state(player) -> dict:
    session = player.session
    questions = _questions(session)
    q = questions[session.current_index] if 0 <= session.current_index < len(questions) else None
    rank = session.players.filter(score__gt=player.score).count() + 1
    data = {
        'session': session.id, 'status': session.status, 'quiz_title': session.quiz.title,
        'index': session.current_index, 'total': len(questions),
        'me': {'nickname': player.nickname, 'score': player.score, 'rank': rank, 'streak': player.streak,
               'players': session.players.count()},
    }
    if q and session.status in (GameSession.Status.QUESTION, GameSession.Status.REVEAL):
        mine = GameAnswer.objects.filter(player=player, question=q).first()
        data['question'] = {
            'text': q.text, 'image_url': q.image_url, 'options': q.options, 'time_limit': q.time_limit,
            'time_left': _time_left(session, q),
        }
        data['answered'] = mine is not None
        data['my_choice'] = mine.choice if mine else None
        if session.status == GameSession.Status.REVEAL:
            data['question']['correct'] = q.correct
            data['result'] = {'is_correct': bool(mine and mine.is_correct), 'points': mine.points if mine else 0}
    if session.status in (GameSession.Status.REVEAL, GameSession.Status.FINISHED):
        data['leaderboard'] = _leaderboard(session, limit=5 if session.status == GameSession.Status.REVEAL else 10)
    return data


class JoinGameView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if not (user.is_student and user.approved) and not user.is_staff_member:
            raise PermissionDenied("Hisobingiz tasdiqlanmagan.")
        pin = str(request.data.get('pin') or '').strip()
        session = GameSession.objects.select_related('journal_class').filter(pin=pin).exclude(
            status=GameSession.Status.FINISHED).first()
        if not session:
            raise ValidationError({'pin': "O'yin topilmadi. Kodni tekshiring."})
        if session.host_id == user.id:
            raise ValidationError({'pin': "O'z o'yiningizga o'yinchi sifatida qo'shila olmaysiz."})
        if session.journal_class_id and user.is_student:
            profile = getattr(user, 'student_profile', None)
            if not profile or profile.journal_class_id != session.journal_class_id:
                raise PermissionDenied("Bu o'yin boshqa sinf uchun.")
        try:
            with transaction.atomic():
                player, _ = GamePlayer.objects.get_or_create(session=session, user=user, defaults={'nickname': user.name[:60]})
        except IntegrityError:
            player = GamePlayer.objects.get(session=session, user=user)
        broadcast(session.id)
        return Response(player_state(player))


class PlayerStateView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, session_id):
        return Response(player_state(_player_or_403(request, session_id)))


class PlayerAnswerView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [GameAnswerRateThrottle]

    def post(self, request, session_id):
        player = _player_or_403(request, session_id)
        session = player.session
        if session.status != GameSession.Status.QUESTION:
            raise ValidationError({'detail': "Hozir javob qabul qilinmaydi."})
        questions = _questions(session)
        q = questions[session.current_index]
        elapsed = (timezone.now() - session.question_started_at).total_seconds()
        if elapsed > q.time_limit + ANSWER_GRACE_SECONDS:
            raise ValidationError({'detail': "Vaqt tugadi."})
        try:
            choice = int(request.data.get('choice'))
        except (TypeError, ValueError):
            raise ValidationError({'choice': "Variant tanlanmagan."})
        if not 0 <= choice < len(q.options):
            raise ValidationError({'choice': "Variant noto'g'ri."})

        correct = choice == q.correct
        points = 0
        if correct:
            ratio = min(max(elapsed, 0), q.time_limit) / q.time_limit
            points = round(q.points * (1 - 0.5 * ratio)) + 100 * min(player.streak, 5)
        try:
            with transaction.atomic():
                GameAnswer.objects.create(
                    player=player, question=q, choice=choice, is_correct=correct, points=points,
                    elapsed_ms=int(max(elapsed, 0) * 1000),
                )
                if correct:
                    GamePlayer.objects.filter(pk=player.pk).update(score=F('score') + points, streak=F('streak') + 1)
                else:
                    GamePlayer.objects.filter(pk=player.pk).update(streak=0)
        except IntegrityError:
            raise ValidationError({'detail': "Siz bu savolga javob bergansiz."})
        broadcast(session.id)
        player.refresh_from_db()
        return Response(player_state(player))


# ── Mini-games ────────────────────────────────────────────────────────

class MiniScoreView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        user = request.user
        if not (user.is_student and user.approved) and not user.is_staff_member:
            raise PermissionDenied("Hisobingiz tasdiqlanmagan.")
        game = str(request.data.get('game') or '')
        if game not in MINI_GAMES:
            raise ValidationError({'game': "Noma'lum o'yin."})
        try:
            score = int(request.data.get('score', 0))
            correct = int(request.data.get('correct', 0))
            total = int(request.data.get('total', 0))
            duration = int(request.data.get('duration_sec', 0))
        except (TypeError, ValueError):
            raise ValidationError({'detail': "Ma'lumot noto'g'ri."})
        # Plausibility bounds — these scores are client-reported, so they
        # only ever feed the game leaderboard, never official rankings.
        if not (0 <= correct <= total <= 100) or not 0 <= score <= correct * MINI_GAMES[game]:
            raise ValidationError({'detail': "Natija noto'g'ri."})
        if total and duration < total:
            raise ValidationError({'detail': "Natija noto'g'ri."})
        MiniGameScore.objects.create(user=user, game=game, score=score, correct=correct, total=total,
                                     duration_sec=min(duration, 3600))
        best = MiniGameScore.objects.filter(user=user, game=game).aggregate(b=Max('score'))['b']
        return Response({'saved': True, 'best': best}, status=status.HTTP_201_CREATED)


class MiniLeaderboardView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        game = request.query_params.get('game')
        if game not in MINI_GAMES:
            raise ValidationError({'game': "Noma'lum o'yin."})
        qs = MiniGameScore.objects.filter(game=game)
        scope = request.query_params.get('scope', 'class')
        if user.is_student:
            profile = getattr(user, 'student_profile', None)
            if scope == 'class' and profile and profile.journal_class_id:
                qs = qs.filter(user__student_profile__journal_class_id=profile.journal_class_id)
            elif profile and profile.grade:
                qs = qs.filter(user__student_profile__grade=profile.grade)
        elif not user.is_oversight:
            qs = qs.filter(user__student_profile__journal_class__teacher=user) | qs.filter(user=user)
        rows = qs.values('user', 'user__name').annotate(best=Max('score')).order_by('-best')[:20]
        mine = MiniGameScore.objects.filter(user=user, game=game).aggregate(b=Max('score'))['b']
        return Response({
            'rows': [{'name': r['user__name'], 'best': r['best'], 'is_me': r['user'] == user.id, 'rank': i}
                     for i, r in enumerate(rows, start=1)],
            'my_best': mine,
        })


class MiniMyBestView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rows = MiniGameScore.objects.filter(user=request.user).values('game').annotate(best=Max('score'), plays=Count('id'))
        return Response({r['game']: {'best': r['best'], 'plays': r['plays']} for r in rows})


def is_session_member(user, session_id) -> bool:
    if not user or not user.is_authenticated:
        return False
    if user.is_oversight and user.is_staff_member:
        return True
    return (
        GameSession.objects.filter(pk=session_id, host=user).exists()
        or GamePlayer.objects.filter(session_id=session_id, user=user).exists()
    )

