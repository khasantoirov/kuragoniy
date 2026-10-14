"""Creating student accounts — from a teacher's journal roster, one by
one, or by the student themself with a class join code."""

import re
import secrets

from django.db import transaction
from django.db.models import Q

from accounts.models import User
from common.security import generate_readable_password

from .models import ClassInvite, StudentProfile

_CYR = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i',
    'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
    'у': 'u', 'ф': 'f', 'х': 'x', 'ц': 's', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ы': 'i', 'ь': '',
    'э': 'e', 'ю': 'yu', 'я': 'ya', 'ў': 'o', 'қ': 'q', 'ғ': 'g', 'ҳ': 'h',
}

USERNAME_RE = re.compile(r'^[a-z0-9][a-z0-9._]{2,39}$')

# Generated logins: first name + surname run together, no dots
# ("Aliyev Vali" -> "valialiyev"); a namesake gets "valialiyev2".
USERNAME_MAX = 40
_SURNAME = re.compile(r'(ov|ova|ev|eva|zoda|zade|skiy|skaya|dze|yan)$')
_PATRONYMIC = re.compile(r'(ovich|evich|ovna|evna)$')
_PATRONYMIC_WORDS = {'ogli', 'ugli', 'qizi', 'kizi'}

# Join codes avoid look-alike characters (0/O, 1/I/L) — they're read off a
# board or a printout.
_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'


def transliterate(text: str) -> str:
    out = []
    for ch in str(text or '').lower():
        out.append(_CYR.get(ch, ch))
    s = ''.join(out)
    s = re.sub(r"[ʻʼ‘’`´']", '', s)  # o'g'il -> ogil
    return s


def username_base(full_name: str) -> str:
    """First name + surname, whole, lowercase Latin, nothing in between.

    Journal rosters are written "Familiya Ism [Otasining ismi]" (that's
    what the live data shows), so the second word is taken as the first
    name — unless only the second word looks like a surname ("Vali
    Aliyev"), then the order is the other way round. Patronymics are
    dropped either way."""
    parts = [re.sub(r'[^a-z0-9]', '', p) for p in transliterate(full_name).split()]
    parts = [p for p in parts if p and p not in _PATRONYMIC_WORDS]
    if len(parts) > 2:
        parts = [p for i, p in enumerate(parts) if i < 2 or not _PATRONYMIC.search(p)]
    if not parts:
        base = 'oquvchi'
    elif len(parts) == 1:
        base = parts[0]
    else:
        first, second = parts[0], parts[1]
        if _SURNAME.search(second) and not _SURNAME.search(first):
            base = first + second
        else:
            base = second + first
    base = base[:USERNAME_MAX - 3]
    if len(base) < 3:
        base = f'oquvchi{base}'
    return base


def _login_taken(candidate: str, exclude_pk=None) -> bool:
    # A renamed account still answers to its old login (User.previous_username),
    # so a new account mustn't take that one either.
    qs = User.objects.filter(Q(username__iexact=candidate) | Q(previous_username__iexact=candidate))
    if exclude_pk:
        qs = qs.exclude(pk=exclude_pk)
    return qs.exists()


def unique_username(full_name: str, exclude_pk=None, reserved=frozenset()) -> str:
    """`reserved`: logins already promised in the same batch but not saved
    yet (the rename command's dry run)."""
    base = username_base(full_name)
    candidate = base
    n = 1
    while candidate in reserved or _login_taken(candidate, exclude_pk):
        n += 1
        candidate = f'{base}{n}'
    return candidate


def normalize_username(raw: str) -> str:
    return str(raw or '').strip().lower()


def new_join_code() -> str:
    while True:
        code = ''.join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        if not ClassInvite.objects.filter(code=code).exists():
            return code


def grade_from_class_name(name: str):
    m = re.match(r'\s*(\d{1,2})', str(name or ''))
    if m:
        g = int(m.group(1))
        if 5 <= g <= 11:
            return g
    return None


@transaction.atomic
def create_student_account(*, full_name: str, journal_class, roster_entry=None, created_by=None,
                           username: str | None = None, password: str | None = None,
                           approved: bool = True, must_change_password: bool = True):
    """Returns (user, plain_password). The plain password is only ever
    returned here, to be shown/printed once — it isn't stored anywhere."""
    username = normalize_username(username) or unique_username(full_name)
    plain = password or generate_readable_password()
    user = User.objects.create_user(
        email=None,
        username=username,
        password=plain,
        name=full_name.strip()[:150],
        role=User.Role.STUDENT,
        approved=approved,
        must_change_password=must_change_password,
    )
    StudentProfile.objects.create(
        user=user,
        journal_class=journal_class,
        roster_entry=roster_entry,
        grade=grade_from_class_name(journal_class.name) if journal_class else None,
        created_by=created_by,
    )
    return user, plain
