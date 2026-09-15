from rest_framework.routers import DefaultRouter

from .views import AnnouncementViewSet

router = DefaultRouter()
router.register('', AnnouncementViewSet, basename='announcement')

urlpatterns = router.urls
