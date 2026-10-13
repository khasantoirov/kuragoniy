from rest_framework.routers import DefaultRouter

from django.urls import include, path

from . import views

router = DefaultRouter()
router.register('users', views.UserAdminViewSet, basename='user-admin')

auth_urlpatterns = [
    path('register/', views.RegisterView.as_view(), name='auth-register'),
    path('login/', views.LoginView.as_view(), name='auth-login'),
    path('2fa/verify/', views.TwoFactorVerifyView.as_view(), name='auth-2fa-verify'),
    path('refresh/', views.RefreshView.as_view(), name='auth-refresh'),
    path('logout/', views.LogoutView.as_view(), name='auth-logout'),
    path('password-reset/request/', views.PasswordResetRequestView.as_view(), name='auth-password-reset-request'),
    path('password-reset/confirm/', views.PasswordResetConfirmView.as_view(), name='auth-password-reset-confirm'),
]

account_urlpatterns = [
    path('me/', views.MeView.as_view(), name='account-me'),
    path('me/change-password/', views.ChangePasswordView.as_view(), name='account-change-password'),
    path('me/logout-all/', views.LogoutAllView.as_view(), name='account-logout-all'),
    path('me/telegram-link/', views.TelegramLinkView.as_view(), name='account-telegram-link'),
    path('me/telegram-unlink/', views.TelegramUnlinkView.as_view(), name='account-telegram-unlink'),
    path('me/2fa/setup/', views.TwoFactorSetupView.as_view(), name='account-2fa-setup'),
    path('me/2fa/confirm/', views.TwoFactorConfirmView.as_view(), name='account-2fa-confirm'),
    path('me/2fa/disable/', views.TwoFactorDisableView.as_view(), name='account-2fa-disable'),
    path('audit-log/', views.AuditLogView.as_view(), name='account-audit-log'),
    path('', include(router.urls)),
]
