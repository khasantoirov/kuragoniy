"""The rules for a person's name, phone and birth date — one place, shared by
the profile (accounts/serializers.py MeSerializer), the developer's edit of
anyone's details and the administration's new staff accounts.

The first name is one word ("Hasan", never "Hasan Toirov" — the surname has
its own field), letters of any script with an inner hyphen or apostrophe
(O'tkir, G'ulom, Анна-Мария); the surname may be two words. The name shown
everywhere (User.name) is built from them: "Ism Familiya".
"""

import re
from datetime import date

from django.utils import timezone
from rest_framework.exceptions import ValidationError

_PART = r"[^\W\d_]+(?:[-'ʻʼ‘’`][^\W\d_]+)*"
FIRST_NAME_RE = re.compile(rf'{_PART}')
LAST_NAME_RE = re.compile(rf'{_PART}(?: {_PART})?')


def _tidy(value) -> str:
    return ' '.join(str(value or '').split())


def _cap(word: str) -> str:
    return ' '.join(w[:1].upper() + w[1:] for w in word.split(' '))


def clean_first_name(value) -> str:
    v = _tidy(value)
    if not v:
        raise ValidationError("Ismni kiriting.")
    if ' ' in v:
        raise ValidationError("Ism bitta so'zdan iborat bo'lsin — familiyani alohida maydonga yozing.")
    if not (2 <= len(v) <= 40 and FIRST_NAME_RE.fullmatch(v)):
        raise ValidationError("Ismni to'g'ri yozing: faqat harflar.")
    return _cap(v)


def clean_last_name(value) -> str:
    v = _tidy(value)
    if not v:
        return ''
    if not (2 <= len(v) <= 60 and LAST_NAME_RE.fullmatch(v)):
        raise ValidationError("Familiyani to'g'ri yozing: faqat harflar.")
    return _cap(v)


def clean_phone(value) -> str:
    """+998901234567 from '90 123 45 67', '+998 (90) 123-45-67', ... A bare
    nine-digit number is an Uzbek one."""
    raw = str(value or '').strip()
    digits = re.sub(r'\D', '', raw)
    if not digits:
        raise ValidationError("Telefon raqamni kiriting.")
    if len(digits) == 9:
        digits = '998' + digits
    if not 10 <= len(digits) <= 15 or (digits.startswith('998') and len(digits) != 12):
        raise ValidationError("Telefon raqamni to'liq kiriting: +998 90 123 45 67.")
    return '+' + digits


def clean_bday(value):
    if not value:
        raise ValidationError("Tug'ilgan sanani kiriting.")
    if not isinstance(value, date):
        raise ValidationError("Tug'ilgan sanani to'g'ri kiriting.")
    if value > timezone.localdate() or value < date(1930, 1, 1):
        raise ValidationError("Tug'ilgan sanani to'g'ri kiriting.")
    return value


def full_name(first: str, last: str) -> str:
    return f'{first} {last}'.strip()


def split_full_name(name) -> tuple[str, str]:
    """A guess at (first name, surname) from an old one-field name, to fill
    the profile form once — the owner confirms it. Rosters are written
    "Familiya Ism [Otasining ismi]", so the second word is the first name
    unless only the second one looks like a surname ("Vali Aliyev")."""
    from learning.student_accounts import _SURNAME, transliterate

    words = _tidy(name).split(' ')
    words = [w for w in words if w]
    if not words:
        return '', ''
    if len(words) == 1:
        return words[0], ''
    a, b = words[0], words[1]
    looks = lambda w: bool(_SURNAME.search(re.sub(r'[^a-z]', '', transliterate(w))))  # noqa: E731
    if looks(b) and not looks(a):
        return a, b
    return b, a
