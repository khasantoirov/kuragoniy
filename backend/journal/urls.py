from rest_framework.routers import DefaultRouter

from .views import FinalGradeViewSet, JournalClassViewSet, StudentViewSet

router = DefaultRouter()
router.register('classes', JournalClassViewSet, basename='journal-class')
router.register('students', StudentViewSet, basename='journal-student')
router.register('finals', FinalGradeViewSet, basename='journal-final')

urlpatterns = router.urls
