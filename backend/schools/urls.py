from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register('', views.SchoolViewSet, basename='school')

# Fixed paths first — the router's detail route would otherwise swallow
# "unlinked" etc. as a school pk.
urlpatterns = [
    path('unlinked/', views.UnlinkedView.as_view(), name='schools-unlinked'),
    path('link/', views.LinkView.as_view(), name='schools-link'),
    path('directory/', views.DirectoryView.as_view(), name='schools-directory'),
    path('stats/overview/', views.StatsOverviewView.as_view(), name='schools-stats-overview'),
    path('stats/classes/', views.StatsClassesView.as_view(), name='schools-stats-classes'),
    path('stats/attention/', views.StatsAttentionView.as_view(), name='schools-stats-attention'),
    path('stats/school/<str:school_id>/', views.StatsSchoolView.as_view(), name='schools-stats-school'),
    *router.urls,
]
