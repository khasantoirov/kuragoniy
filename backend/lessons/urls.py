from rest_framework.routers import DefaultRouter

from .views import LessonPosterViewSet, LessonViewSet

router = DefaultRouter()
# 'posters' must be registered before the '' (root) LessonViewSet — that
# viewset's detail route (^(?P<pk>...)/$) would otherwise match "posters/"
# as a lesson pk lookup, since DRF tries routes in registration order.
router.register('posters', LessonPosterViewSet, basename='lesson-poster')
router.register('', LessonViewSet, basename='lesson')

urlpatterns = router.urls
