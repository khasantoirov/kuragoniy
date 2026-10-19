"""Signed-in devices ("Aktiv seanslar") and the self-service views around
them: the sessions list, the user's own security history and the profile
overview numbers."""

from datetime import timedelta

from django.conf import settings
from django.db.models import Avg, Count, Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from common.security import client_ip, log_event
from common.useragent import parse_hints, summarize

from .models import UserSession

TOUCH_EVERY = timedelta(minutes=5)
NEW_DEVICE_LOOKBACK = timedelta(days=90)
REFRESH_COOKIE = 'refresh_token'


def idle_window() -> timedelta:
    """How long a session may go without a refresh before it counts as
    abandoned. An open tab refreshes at least every ACCESS_TOKEN_LIFETIME
    (the heartbeat keeps the access token in use) and last_seen_at moves in
    TOUCH_EVERY steps, so silence past idle timeout + both of those means
    the tab was closed or frozen for longer than the idle limit."""
    return settings.SESSION_IDLE_TIMEOUT + settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'] + TOUCH_EVERY


def _ua(request) -> str:
    return (request.META.get('HTTP_USER_AGENT', '') if request is not None else '')[:300]


def _hints(request) -> dict:
    return parse_hints(request.META.get('HTTP_X_DEVICE')) if request is not None else {}


def describe(session) -> dict:
    return summarize(session.user_agent, session.device)


def _seen_before(info, previous) -> bool:
    """Same browser on the same system — and the same phone model once
    models are known. Sessions from before device details were collected
    only know the family; they count as a match only while no session of
    that family has a model yet (so the first login after this change
    doesn't warn everyone)."""
    same = [summarize(ua, device) for ua, device in previous]
    same = [old for old in same if old['family'] == info['family']]
    if not same:
        return False
    known = {old['model'] for old in same if old['model']}
    if not info['model'] or not known:
        return True
    return info['model'] in known


def start_session(user, refresh, request) -> UserSession | None:
    """Called for every freshly issued refresh token (login, 2FA step,
    password change). Warns over the user's channels when the device is
    one this account hasn't signed in from lately."""
    ua = _ua(request)
    hints = _hints(request)
    info = summarize(ua, hints)
    since = timezone.now() - NEW_DEVICE_LOOKBACK
    previous = list(UserSession.objects.filter(user=user, created_at__gte=since).values_list('user_agent', 'device'))
    try:
        session = UserSession.objects.create(
            user=user, jti=str(refresh['jti']), ip=client_ip(request), user_agent=ua, device=hints,
        )
    except Exception:
        return None
    if previous and not _seen_before(info, previous):
        from notifications.models import Kind
        from notifications.service import notify
        ip = session.ip or "noma'lum IP"
        when = timezone.localtime(session.created_at).strftime('%d.%m.%Y %H:%M')
        title = info['device'] or info['kind_label']
        notify(
            user, Kind.XAVFSIZLIK, 'Yangi qurilmadan kirildi', f"{info['label']} · IP {ip}", '/settings/profile?tab=sessions',
            telegram_text=(
                "🔐 Hisobingizga yangi qurilmadan kirildi\n\n"
                f"📱 Qurilma: {title} ({info['kind_label'].lower()})\n"
                f"💻 Tizim: {info['os_full']} · {info['browser_full']}\n"
                f"🌐 IP: {ip}\n"
                f"🕒 Vaqt: {when}\n\n"
                "Agar bu siz bo'lmasangiz, Sozlamalar → Profil → Aktiv seanslar bo'limidan uni chiqarib, parolni almashtiring."
            ),
            data={'device': title, 'kind': info['kind'], 'os': info['os_full'], 'browser': info['browser_full'], 'ip': ip},
        )
    return session


def session_for_token(token) -> UserSession | None:
    jti = token.get('jti') if token is not None else None
    return UserSession.objects.filter(jti=str(jti)).first() if jti else None


def touch_session(session, request) -> None:
    if session is None:
        return
    if not session.device:
        # Sessions opened before the app sent device details pick them up
        # on their next refresh.
        hints = _hints(request)
        if hints:
            session.device = hints
            session.save(update_fields=['device'])
    now = timezone.now()
    if now - session.last_seen_at < TOUCH_EVERY:
        return
    session.last_seen_at = now
    session.ip = client_ip(request) or session.ip
    session.save(update_fields=['last_seen_at', 'ip'])


def end_session(token) -> None:
    session = session_for_token(token)
    if session and not session.revoked_at:
        session.revoked_at = timezone.now()
        session.save(update_fields=['revoked_at'])


def revoke_all_sessions(user) -> None:
    UserSession.objects.filter(user=user, revoked_at__isnull=True).update(revoked_at=timezone.now())


def _current_jti(request):
    raw = request.COOKIES.get(REFRESH_COOKIE)
    if not raw:
        return None
    try:
        return str(RefreshToken(raw)['jti'])
    except TokenError:
        return None


def _active(user):
    now = timezone.now()
    return UserSession.objects.filter(
        user=user, revoked_at__isnull=True,
        created_at__gte=now - settings.SESSION_MAX_AGE, last_seen_at__gte=now - idle_window(),
    )


class SessionListView(APIView):
    """GET /api/auth/sessions/ — lives under /api/auth/ so the refresh
    cookie comes along and the current device can be marked."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        current = _current_jti(request)
        rows = []
        for s in _active(request.user):
            info = describe(s)
            rows.append({
                'id': s.id, 'label': info['label'], 'browser': info['browser'], 'os': info['os'],
                'mobile': info['mobile'], 'kind': info['kind'], 'device': info['device'], 'model': info['model'],
                'os_full': info['os_full'], 'browser_full': info['browser_full'],
                'ip': s.ip, 'created_at': s.created_at, 'last_seen_at': s.last_seen_at,
                'expires_at': s.created_at + settings.SESSION_MAX_AGE,
                'current': s.jti == current,
            })
        rows.sort(key=lambda r: (not r['current'], -r['last_seen_at'].timestamp()))
        return Response(rows)


class SessionRevokeView(APIView):
    """POST /api/auth/sessions/<id>/revoke/ — signs that device out: its
    refresh token is blacklisted, so it can't get a new access token (the
    one it holds expires within ACCESS_TOKEN_LIFETIME)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

        session = _active(request.user).filter(pk=pk).first()
        if session is None:
            return Response({'detail': 'Seans topilmadi.'}, status=status.HTTP_404_NOT_FOUND)
        if session.jti == _current_jti(request):
            return Response({'detail': "Joriy qurilmadan chiqish uchun «Chiqish» tugmasidan foydalaning."},
                            status=status.HTTP_400_BAD_REQUEST)
        token = OutstandingToken.objects.filter(jti=session.jti).first()
        if token:
            BlacklistedToken.objects.get_or_create(token=token)
        session.revoked_at = timezone.now()
        session.save(update_fields=['revoked_at'])
        log_event('session_revoked', actor=request.user, request=request, detail=describe(session)['label'])
        return Response(status=status.HTTP_204_NO_CONTENT)


SECURITY_ACTIONS = (
    'login_ok', 'login_failed', 'login_locked', 'password_changed', 'password_reset_done', 'password_reset_requested',
    'logout_all', 'session_revoked', '2fa_enabled', '2fa_disabled',
)


class SecurityLogView(APIView):
    """GET /api/accounts/me/security-log/ — the user's own sign-in and
    security history (the full journal stays admin-only)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from common.models import AuditLog

        rows = list(AuditLog.objects.filter(actor=request.user, action__in=SECURITY_ACTIONS).order_by('-created_at')[:40])
        # A sign-in's session is created in the same request, so its device
        # details (phone model etc.) can be matched back by time.
        sessions = []
        if rows:
            sessions = list(UserSession.objects.filter(
                user=request.user, created_at__gte=rows[-1].created_at - timedelta(seconds=5),
            ).exclude(device={}).values_list('created_at', 'device'))

        def device(r):
            if not r.user_agent:
                return ''
            hints = next((d for at, d in sessions if abs((at - r.created_at).total_seconds()) < 5), None)
            return summarize(r.user_agent, hints)['label']

        return Response([
            {'id': r.id, 'action': r.action, 'at': r.created_at, 'ip': r.ip, 'device': device(r), 'detail': r.detail}
            for r in rows
        ])


class OverviewView(APIView):
    """GET /api/accounts/me/overview/ — the numbers on the Profile page."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        out = {'role': user.role, 'joined': user.created_at}
        if user.is_student:
            return Response(out)
        from journal.models import JournalClass, Student
        from learning.models import Assignment, Attempt, Award, LessonReport, StudentProfile

        reports = LessonReport.objects.filter(teacher=user)
        agg = reports.aggregate(
            total=Count('id'),
            reviewed=Count('id', filter=Q(status=LessonReport.Status.REVIEWED)),
            returned=Count('id', filter=Q(status=LessonReport.Status.RETURNED)),
            pending=Count('id', filter=Q(status=LessonReport.Status.SUBMITTED)),
            rating=Avg('rating', filter=Q(status=LessonReport.Status.REVIEWED)),
        )
        classes = JournalClass.objects.filter(teacher=user)
        out.update({
            'classes': classes.count(),
            'students': Student.objects.filter(journal_class__in=classes, active=True).count(),
            'accounts': StudentProfile.objects.filter(journal_class__in=classes).count(),
            'assignments': Assignment.objects.filter(teacher=user).count(),
            'readiness': Attempt.objects.filter(user=user, kind=Attempt.Kind.READINESS, submitted_at__isnull=False).count(),
            'awards': Award.objects.filter(recipient=user).count(),
            'reports': {k: agg[k] for k in ('total', 'reviewed', 'returned', 'pending')},
            'rating': round(agg['rating'], 2) if agg['rating'] is not None else None,
            'recent_reports': [
                {'id': r.id, 'topic': r.topic, 'date': r.date, 'status': r.status, 'rating': r.rating,
                 'comment': r.review_comment[:200]}
                for r in reports.order_by('-date', '-created_at')[:30]
            ],
            'recent_awards': [
                {'id': a.id, 'title': a.title, 'period': a.period, 'created_at': a.created_at}
                for a in Award.objects.filter(recipient=user).order_by('-created_at')[:10]
            ],
        })
        return Response(out)
