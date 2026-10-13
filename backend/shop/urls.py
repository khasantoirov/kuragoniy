from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('products', views.ProductViewSet, basename='shop-product')
router.register('orders', views.OrderViewSet, basename='shop-order')

urlpatterns = [
    path('settings/', views.ShopSettingsView.as_view(), name='shop-settings'),
    path('purchases/', views.PurchasesView.as_view(), name='shop-purchases'),
    path('stats/', views.ShopStatsView.as_view(), name='shop-stats'),
    *router.urls,
]
