from rest_framework.routers import DefaultRouter

from .views import TimetableSlotViewSet

router = DefaultRouter()
router.register('slots', TimetableSlotViewSet, basename='timetable-slot')

urlpatterns = router.urls
