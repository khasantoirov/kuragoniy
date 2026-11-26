from .base import *  # noqa: F401,F403

DEBUG = True
ALLOWED_HOSTS = ['localhost', '127.0.0.1', 'admin.localhost']
# the panel while developing: http://admin.localhost:<port>
ADMIN_HOSTS = [*ADMIN_HOSTS, 'admin.localhost']  # noqa: F405

MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend',
    },
}
