"""
Base settings shared by dev.py and prod.py.
"""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
env_file = BASE_DIR / '.env'
if env_file.exists():
    environ.Env.read_env(env_file)

SECRET_KEY = env('DJANGO_SECRET_KEY', default='django-insecure-dev-key-change-in-prod')

DEV_SUPERUSER_EMAILS = env.list('DEV_SUPERUSER_EMAILS', default=['khasantoirov@gmail.com'])


# Application definition

INSTALLED_APPS = [
    # 'daphne' must be the very first app for its runserver override
    # (ASGI + WebSocket support in `manage.py runserver`) to take effect.
    'daphne',

    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    'channels',

    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',

    'common',
    'accounts',
    'lessons',
    'journal',
    'timetable',
    'library',
    'announcements',
    'telegrambot',
    'realtime',
    'webpush',
    'migration_tools',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'


# Database
# SQLite with WAL journal mode so the Django server process and the
# Telegram bot process (a separate OS process, see telegrambot app) can
# both hold open connections without "database is locked" errors.
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        # DB_PATH lets Docker/VPS deployments point this at a mounted
        # volume (e.g. /app/data/db.sqlite3) shared between the backend
        # and bot containers; defaults to the repo-local file for dev.
        'NAME': env('DB_PATH', default=str(BASE_DIR / 'db.sqlite3')),
        'OPTIONS': {
            'timeout': 20,
            'init_command': (
                'PRAGMA journal_mode=WAL;'
                'PRAGMA synchronous=NORMAL;'
                'PRAGMA foreign_keys=ON;'
            ),
        },
    }
}

AUTH_USER_MODEL = 'accounts.User'


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# Internationalization
# Uzbek is the primary content language; Asia/Tashkent matches the old
# bot's cron schedule (backup jobs, etc.) and the school's real timezone.

LANGUAGE_CODE = 'uz'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True


# Static / media files

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# Django REST Framework

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_THROTTLE_RATES': {
        'login': '10/min',
        'register': '5/hour',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    # Rotation made every refresh token single-use (old one blacklisted the
    # moment a new one is issued). The refresh cookie is shared across every
    # tab/device on the same browser, so two tabs refreshing within
    # milliseconds of each other — a normal occurrence, e.g. reopening a PWA
    # on a phone while a laptop tab is also open — could each redeem the
    # same token; the loser's request then carries an already-blacklisted
    # one and gets logged out, even though the user typed nothing wrong.
    # The refresh cookie is httpOnly + Secure + SameSite=Lax already, so
    # single-use rotation was only adding narrow extra protection against a
    # stolen cookie — not worth this recurring false "please log in again".
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# Refresh token is carried in an httpOnly cookie (see accounts.api.views)
# rather than response JSON, to reduce XSS exposure in the PWA.
JWT_REFRESH_COOKIE_NAME = 'refresh_token'
JWT_REFRESH_COOKIE_PATH = '/api/auth/'


# Channels — Redis-backed channel layer so the Django ASGI server and the
# separate Telegram bot process can publish/receive on the same groups.
# Falls back to the in-process in-memory layer when REDIS_URL isn't set
# (e.g. local dev without Redis installed) — fine for single-process
# `runserver` testing, but the bot process (Milestone 6) needs real Redis
# since it runs in a separate OS process.
_redis_url = env('REDIS_URL', default=None)
if _redis_url:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.core.RedisChannelLayer',
            'CONFIG': {'hosts': [_redis_url]},
        },
    }
else:
    CHANNEL_LAYERS = {
        'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'},
    }


# CORS — frontend (Vite dev server / built SPA) runs on a different
# origin than the Django API, unlike the old same-origin Firebase setup.
CORS_ALLOWED_ORIGINS = env.list('CORS_ALLOWED_ORIGINS', default=[
    'http://localhost:5173',
    'http://127.0.0.1:5173',
])
CORS_ALLOW_CREDENTIALS = True


# Web Push (VAPID) — see webpush/send.py. Public key is also served to the
# frontend via GET /api/push/vapid-public-key/ so it never needs to be
# duplicated into a frontend build-time env var.
VAPID_PUBLIC_KEY = env('VAPID_PUBLIC_KEY', default='')
VAPID_PRIVATE_KEY = env('VAPID_PRIVATE_KEY', default='')
VAPID_CONTACT_EMAIL = env('VAPID_CONTACT_EMAIL', default='admin@stemlms.uz')  # TODO: your real domain
