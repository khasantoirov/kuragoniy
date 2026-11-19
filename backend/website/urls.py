from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('admin/photos', views.PhotoViewSet, basename='site-photo')
router.register('admin/testimonials', views.TestimonialViewSet, basename='site-testimonial')
router.register('admin/mentors', views.MentorViewSet, basename='site-mentor')
router.register('admin/leads', views.LeadViewSet, basename='site-lead')

urlpatterns = [
    path('landing/', views.LandingView.as_view(), name='site-landing'),
    path('leads/', views.LeadCreateView.as_view(), name='site-lead-create'),
    path('admin/settings/', views.SettingsView.as_view(), name='site-settings'),
    path('', include(router.urls)),
]
