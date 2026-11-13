from django.urls import path

from . import views

urlpatterns = [
    path('courses/', views.CoursesView.as_view(), name='training-courses'),
    path('courses/<int:pk>/', views.CourseView.as_view(), name='training-course'),
    path('courses/<int:pk>/enroll/', views.EnrollView.as_view(), name='training-enroll'),
    path('courses/<int:pk>/modules/', views.ModulesView.as_view(), name='training-modules'),
    path('courses/<int:pk>/order/', views.ModuleOrderView.as_view(), name='training-module-order'),
    path('courses/<int:pk>/assign/', views.AssignView.as_view(), name='training-assign'),
    path('courses/<int:pk>/unassign/', views.UnassignView.as_view(), name='training-unassign'),
    path('courses/<int:pk>/progress/', views.CourseProgressView.as_view(), name='training-progress'),
    path('modules/<int:pk>/', views.ModuleView.as_view(), name='training-module'),
    path('modules/<int:pk>/start/', views.TestStartView.as_view(), name='training-test-start'),
    path('attempts/<int:pk>/submit/', views.TestSubmitView.as_view(), name='training-test-submit'),
    path('lessons/<int:pk>/done/', views.LessonDoneView.as_view(), name='training-lesson-done'),
    path('schools/<int:school_id>/', views.SchoolTrainingView.as_view(), name='training-school'),
    path('certificates/', views.CertificatesView.as_view(), name='training-certificates'),
    path('certificates/<int:pk>/', views.CertificateView.as_view(), name='training-certificate'),
    path('verify/<str:code>/', views.VerifyView.as_view(), name='training-verify'),
]
