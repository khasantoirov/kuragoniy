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
]

account_urlpatterns = [
    path('me/', views.MeView.as_view(), name='account-me'),
    path('me/change-password/', views.ChangePasswordView.as_view(), name='account-change-password'),
    path('me/2fa/setup/', views.TwoFactorSetupView.as_view(), name='account-2fa-setup'),
    path('me/2fa/confirm/', views.TwoFactorConfirmView.as_view(), name='account-2fa-confirm'),
    path('me/2fa/disable/', views.TwoFactorDisableView.as_view(), name='account-2fa-disable'),
    path('', include(router.urls)),
]
