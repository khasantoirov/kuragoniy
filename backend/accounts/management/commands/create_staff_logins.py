"""Give every staff account that signs in with an email a login as well,
built from the name the way new staff get one (first name + surname:
"hasantoirov", a namesake "hasantoirov2").

Only the login is added: the password and the email stay as they are, so
the email keeps working at sign-in until it is switched off on purpose.

    manage.py create_staff_logins            # dry run: prints the plan
    manage.py create_staff_logins --apply
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Q

from accounts.models import User
from common.security import log_event
from learning.student_accounts import unique_username


class Command(BaseCommand):
    help = "Email bilan kiradigan xodimlarga login yaratadi (ism+familiya); parol va email o'zgarmaydi."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help="O'zgartirishlarni saqlash (aks holda faqat reja)")

    def handle(self, *args, apply=False, **options):
        staff = (User.objects.filter(Q(username__isnull=True) | Q(username=''))
                 .exclude(role=User.Role.STUDENT, is_dev_superuser=False)
                 .order_by('id'))
        made = 0
        planned: set[str] = set()
        with transaction.atomic():
            for user in staff:
                login = unique_username(user.name or (user.email or '').split('@')[0], reserved=planned)
                planned.add(login)
                self.stdout.write(f'{login:24s} {user.name} ({user.get_role_display()})')
                if apply:
                    user.username = login
                    user.save(update_fields=['username'])
                made += 1
            if apply and made:
                log_event('staff_logins_created', detail=f'{made} ta xodimga login yaratildi')
        verb = 'yaratildi' if apply else 'yaratiladi (--apply bilan saqlanadi)'
        self.stdout.write(self.style.SUCCESS(f'{made} ta login {verb}.'))
