from rest_framework.routers import DefaultRouter

from .views import (EquipmentItemViewSet, EquipmentRegistryViewSet, EquipmentSheetViewSet, LabEquipmentViewSet,
                    LessonViewSet)

router = DefaultRouter()
# 'equipment-items'/'equipment-sheets' must be registered before the '' (root)
# LessonViewSet — its detail route (^(?P<pk>...)/$) would otherwise match
# them as a lesson pk lookup, since DRF tries routes in registration order.
router.register('equipment-items', EquipmentItemViewSet, basename='equipment-item')
router.register('equipment-sheets', EquipmentSheetViewSet, basename='equipment-sheet')
router.register('equipment-registry', EquipmentRegistryViewSet, basename='equipment-registry')
router.register('lab-equipment', LabEquipmentViewSet, basename='lab-equipment')
router.register('', LessonViewSet, basename='lesson')

urlpatterns = router.urls
