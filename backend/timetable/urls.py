from django.urls import path
from rest_framework.routers import DefaultRouter

from .bells import BellsDetailView, BellsListView
from .views import TimetableSlotViewSet

router = DefaultRouter()
router.register('slots', TimetableSlotViewSet, basename='timetable-slot')

urlpatterns = [
    # the schools' lesson times (timetable/bells.py)
    path('bells/', BellsListView.as_view(), name='timetable-bells'),
    path('bells/<int:school_id>/', BellsDetailView.as_view(), name='timetable-bells-detail'),
    *router.urls,
]
