from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ControlWorkViewSet, EditGrantViewSet, FinalGradeViewSet, JournalClassViewSet, StudentTransferView, StudentViewSet,
)

router = DefaultRouter()
router.register('classes', JournalClassViewSet, basename='journal-class')
router.register('students', StudentViewSet, basename='journal-student')
router.register('finals', FinalGradeViewSet, basename='journal-final')
router.register('grants', EditGrantViewSet, basename='journal-grant')
router.register('controls', ControlWorkViewSet, basename='journal-control')

urlpatterns = [
    path('students/<int:pk>/transfer/', StudentTransferView.as_view(), name='journal-student-transfer'),
    *router.urls,
]
