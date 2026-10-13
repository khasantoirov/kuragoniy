from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('classes', views.TeacherClassViewSet, basename='learning-class')
router.register('students', views.StudentManageViewSet, basename='learning-student')
router.register('questions', views.QuestionViewSet, basename='learning-question')
router.register('assignments', views.AssignmentViewSet, basename='learning-assignment')
router.register('attempts', views.AttemptViewSet, basename='learning-attempt')
router.register('reports', views.LessonReportViewSet, basename='learning-report')
router.register('awards', views.AwardViewSet, basename='learning-award')

urlpatterns = [
    path('materials/<int:lesson_id>/', views.LessonMaterialView.as_view(), name='learning-material'),
    path('readiness/status/', views.ReadinessStatusView.as_view(), name='learning-readiness-status'),
    path('readiness/<int:lesson_id>/start/', views.ReadinessStartView.as_view(), name='learning-readiness-start'),
    path('readiness/attempts/<int:attempt_id>/submit/', views.ReadinessSubmitView.as_view(), name='learning-readiness-submit'),
    path('analytics/<slug:report>/', views.AnalyticsView.as_view(), name='learning-analytics'),
    path('teachers/', views.TeachersListView.as_view(), name='learning-teachers'),
    *router.urls,
]
