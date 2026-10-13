from rest_framework.routers import DefaultRouter

from .views import EquipmentItemViewSet, LessonViewSet

router = DefaultRouter()
# 'equipment-items' must be registered before the '' (root) LessonViewSet —
# that viewset's detail route (^(?P<pk>...)/$) would otherwise match it as a
# lesson pk lookup, since DRF tries routes in registration order.
router.register('equipment-items', EquipmentItemViewSet, basename='equipment-item')
router.register('', LessonViewSet, basename='lesson')

urlpatterns = router.urls
