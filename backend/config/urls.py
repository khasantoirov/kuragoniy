from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from accounts import urls as accounts_urls

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include((accounts_urls.auth_urlpatterns, 'accounts'), namespace='auth')),
    path('api/accounts/', include((accounts_urls.account_urlpatterns, 'accounts'), namespace='accounts')),
    path('api/lessons/', include('lessons.urls')),
    path('api/journal/', include('journal.urls')),
    path('api/timetable/', include('timetable.urls')),
    path('api/library/', include('library.urls')),
    path('api/announcements/', include('announcements.urls')),
    path('api/push/', include('webpush.urls')),
    path('api/dashboard/', include('dashboard.urls')),
    path('api/search/', include('globalsearch.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
