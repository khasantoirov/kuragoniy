from rest_framework.routers import DefaultRouter

from django.urls import include, path

from common.formguard import GuardChallengeView

from . import phone_views, sessions, views

router = DefaultRouter()
router.register('users', views.UserAdminViewSet, basename='user-admin')

auth_urlpatterns = [
    path('login/', views.LoginView.as_view(), name='auth-login'),
    path('login/telegram/', views.TelegramStepVerifyView.as_view(), name='auth-login-telegram'),
    path('guard/', GuardChallengeView.as_view(), name='auth-guard'),
    path('phone/start/', phone_views.PhoneStartView.as_view(), name='auth-phone-start'),
    path('phone/register/', phone_views.PhoneRegisterStartView.as_view(), name='auth-phone-register'),
    path('phone/status/', phone_views.PhoneStatusView.as_view(), name='auth-phone-status'),
    path('phone/resend/', phone_views.PhoneResendView.as_view(), name='auth-phone-resend'),
    path('phone/verify/', phone_views.PhoneVerifyView.as_view(), name='auth-phone-verify'),
    path('phone/complete/', phone_views.PhoneCompleteView.as_view(), name='auth-phone-complete'),
    path('2fa/verify/', views.TwoFactorVerifyView.as_view(), name='auth-2fa-verify'),
    path('refresh/', views.RefreshView.as_view(), name='auth-refresh'),
    path('logout/', views.LogoutView.as_view(), name='auth-logout'),
    path('sessions/', sessions.SessionListView.as_view(), name='auth-sessions'),
    path('sessions/<int:pk>/revoke/', sessions.SessionRevokeView.as_view(), name='auth-session-revoke'),
    path('password-reset/request/', views.PasswordResetRequestView.as_view(), name='auth-password-reset-request'),
    path('password-reset/confirm/', views.PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
]

account_urlpatterns = [
    path('me/', views.MeView.as_view(), name='account-me'),
    path('view-as/', views.ViewAsView.as_view(), name='account-view-as'),
    path('me/change-password/', views.ChangePasswordView.as_view(), name='account-change-password'),
    path('me/logout-all/', views.LogoutAllView.as_view(), name='account-logout-all'),
    path('me/heartbeat/', views.HeartbeatView.as_view(), name='account-heartbeat'),
    path('me/security-log/', sessions.SecurityLogView.as_view(), name='account-security-log'),
    path('me/overview/', sessions.OverviewView.as_view(), name='account-overview'),
    path('me/telegram-link/', views.TelegramLinkView.as_view(), name='account-telegram-link'),
    path('me/telegram-unlink/', views.TelegramUnlinkView.as_view(), name='account-telegram-unlink'),
    path('me/2fa/setup/', views.TwoFactorSetupView.as_view(), name='account-2fa-setup'),
    path('me/2fa/confirm/', views.TwoFactorConfirmView.as_view(), name='account-2fa-confirm'),
    path('me/2fa/disable/', views.TwoFactorDisableView.as_view(), name='account-2fa-disable'),
    path('audit-log/', views.AuditLogView.as_view(), name='account-audit-log'),
    path('', include(router.urls)),
]
