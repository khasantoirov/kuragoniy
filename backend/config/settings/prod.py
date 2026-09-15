from .base import *  # noqa: F401,F403

DEBUG = False
ALLOWED_HOSTS = env.list('DJANGO_ALLOWED_HOSTS')  # noqa: F405

SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.smtp.EmailBackend',
        'OPTIONS': {
            'host': env('EMAIL_HOST', default=''),  # noqa: F405
            'port': env.int('EMAIL_PORT', default=587),  # noqa: F405
            'username': env('EMAIL_HOST_USER', default=''),  # noqa: F405
            'password': env('EMAIL_HOST_PASSWORD', default=''),  # noqa: F405
            'use_tls': True,
        },
    },
}
