"""Regenerate every student login in the current format (first name +
surname, no dots: "valialiyev", a namesake "valialiyev2").

Passwords, results and everything else stay as they are. The old login is
kept in User.previous_username and still works at sign-in, so a student
who hasn't been told the new one yet isn't locked out.

    manage.py rename_student_logins            # dry run: prints the plan
    manage.py rename_student_logins --apply
"""

import re

from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import User
from common.security import log_event
from learning.student_accounts import unique_username, username_base


def _roster_name(user) -> str:
    profile = getattr(user, 'student_profile', None)
    entry = getattr(profile, 'roster_entry', None) if profile else None
    return (entry.full_name if entry else '') or user.name or ''


class Command(BaseCommand):
    help = "O'quvchi loginlarini yangi formatga o'tkazadi (ism+familiya, nuqtasiz)."

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help="O'zgartirishlarni saqlash (aks holda faqat reja)")

    def handle(self, *args, apply=False, **options):
        students = (User.objects.filter(role=User.Role.STUDENT)
                    .select_related('student_profile__roster_entry').order_by('id'))
        changed = 0
        planned: set[str] = set()
        with transaction.atomic():
            for user in students:
                name = _roster_name(user)
                base = username_base(name)
                if user.username and re.fullmatch(rf'{re.escape(base)}\d*', user.username):
                    continue  # already in the new format
                new = unique_username(name, exclude_pk=user.pk, reserved=planned)
                planned.add(new)
                self.stdout.write(f'{user.username or "-":32s} -> {new}')
                if apply:
                    user.previous_username = user.username
                    user.username = new
                    user.save(update_fields=['username', 'previous_username'])
                changed += 1
            if apply and changed:
                log_event('student_logins_renamed', detail=f"{changed} ta o'quvchi logini yangi formatga o'tkazildi")
        verb = "o'zgartirildi" if apply else "o'zgaradi (--apply bilan saqlanadi)"
        self.stdout.write(self.style.SUCCESS(f'{changed} ta login {verb}.'))
