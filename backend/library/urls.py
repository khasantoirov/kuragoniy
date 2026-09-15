from rest_framework.routers import DefaultRouter

from .views import LibraryItemViewSet

router = DefaultRouter()
router.register('', LibraryItemViewSet, basename='library-item')

urlpatterns = router.urls
