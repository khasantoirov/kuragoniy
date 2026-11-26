"""Fanlar — the subjects Ko'ragoniy Edu teaches, and who sees which.

Two subjects: Amaliy fizika and STEAM / Robototexnika. A lesson's subject
is told by its grade code, which is unique across subjects:

    STEAM   '1-2' '3-4' '5-6' '7' '8-9'   (grade groups, as before)
    Fizika  'F7'  'F8'  'F9'               (one grade each)

so every piece of code that works "within a grade" (renumbering, import,
readiness, kits, games...) stays inside one subject without knowing about
subjects at all. The administration points each person to their subject(s)
(User.subjects); someone not pointed anywhere yet sees both, as before.
Mirrored on the frontend in features/lessons/labels.ts.
"""

FIZIKA = 'fizika'
STEAM = 'steam'

CHOICES = [(FIZIKA, 'Amaliy fizika'), (STEAM, 'STEAM / Robototexnika')]
CODES = [code for code, _label in CHOICES]
LABELS = dict(CHOICES)

GRADES = {
    STEAM: ['1-2', '3-4', '5-6', '7', '8-9'],
    FIZIKA: ['F7', 'F8', 'F9'],
}
ALL_GRADES = GRADES[STEAM] + GRADES[FIZIKA]

# a class number → the grade code its lessons are filed under
_STEAM_GROUP = {1: '1-2', 2: '1-2', 3: '3-4', 4: '3-4', 5: '5-6', 6: '5-6', 7: '7', 8: '8-9', 9: '8-9'}


def subject_of_grade(grade) -> str:
    return FIZIKA if str(grade) in GRADES[FIZIKA] else STEAM


def grade_for_class(number: int | None, subject: str = STEAM):
    """7 → '7' (STEAM) or 'F7' (fizika); None when the subject has no lessons for it."""
    if number is None:
        return None
    if subject == FIZIKA:
        code = f'F{number}'
        return code if code in GRADES[FIZIKA] else None
    return _STEAM_GROUP.get(number)


def clean_subjects(value) -> list[str]:
    """A list of subject codes as given by a form, in the platform's order;
    raises ValueError on anything that isn't one."""
    if value in (None, ''):
        return []
    if isinstance(value, str):
        value = [v for v in value.split(',') if v.strip()]
    if not isinstance(value, (list, tuple)):
        raise ValueError('subjects must be a list')
    picked = {str(v).strip() for v in value}
    unknown = picked - set(CODES)
    if unknown:
        raise ValueError(f"Noma'lum fan: {', '.join(sorted(unknown))}")
    return [c for c in CODES if c in picked]


def assigned(user) -> list[str]:
    """The subjects the administration pointed this person to (may be empty)."""
    return [c for c in CODES if c in (getattr(user, 'subjects', None) or [])]


def subjects_for(user) -> list[str]:
    """The subjects whose content this person sees. The administration (and
    the read-only oversight roles) see everything; anyone else their own
    subjects — or both while none is set yet."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return list(CODES)
    if getattr(user, 'is_dev_superuser', False) or getattr(user, 'is_oversight', False):
        return list(CODES)
    return assigned(user) or list(CODES)


def grades_for(user) -> list[str]:
    """The lesson grade codes this person sees, in display order."""
    return [g for s in subjects_for(user) for g in GRADES[s]]


def window(request):
    """The fan window a request comes from — Fizika and STEAM are separate
    windows; nothing of one shows in the other. The browser sends its
    window as the X-Fan header; it counts only if this person may see that
    fan. Someone with one fan is always in it. None = no window asked for
    (an older client, a tool): everything this person may see."""
    if request is None:
        return None
    user = getattr(request, 'user', None)
    if getattr(user, 'role', None) == 'student' and not assigned(user):
        # a pupil is in the window of the class they belong to
        profile = getattr(user, 'student_profile', None)
        cls = getattr(profile, 'journal_class', None) if profile else None
        if cls is not None:
            return cls.subject
    mine = subjects_for(user)
    asked = (request.headers.get('X-Fan') or '').strip()
    if asked in mine:
        return asked
    if len(mine) == 1:
        return mine[0]
    return None


def in_window(person, fan) -> bool:
    """Whether a staff member belongs on a fan window's lists: that fan's
    teachers, anyone not pointed to a fan yet, and the administration
    (it runs both)."""
    if not fan:
        return True
    if getattr(person, 'is_dev_superuser', False) or getattr(person, 'is_oversight', False):
        return True
    mine = assigned(person)
    return not mine or fan in mine


def window_people(qs, fan):
    """A User queryset narrowed like in_window(): the fan's teachers, those
    not pointed to a fan yet, and the administration."""
    if not fan:
        return qs
    from django.db.models import Q

    from accounts.models import User

    shared = [User.Role.ADMIN, User.Role.BOSHLIQ, User.Role.KUZATUVCHI, User.Role.MAKTAB]
    return qs.filter(Q(is_dev_superuser=True) | Q(role__in=shared) | Q(subjects=[])
                     | Q(subjects__0=fan) | Q(subjects__1=fan))


def window_grades(request, user=None) -> list[str]:
    """The lesson grade codes of the request's window (all the person's
    grades when there is no window)."""
    fan = window(request)
    return list(GRADES[fan]) if fan else grades_for(user or getattr(request, 'user', None))


def one_fan(codes) -> str:
    """The one fan all of `codes` share ('fizika' / 'steam'), or '' when
    they are of both (or none) — e.g. a day's lessons for a notification."""
    found = {c for c in codes if c}
    return found.pop() if len(found) == 1 else ''


def main_subject(user) -> str:
    """The one subject to read a class number with ("8-A" → '8-9' or 'F8')
    when only one can be used: STEAM unless the person teaches physics only."""
    return FIZIKA if subjects_for(user) == [FIZIKA] else STEAM


def label(codes) -> str:
    return ', '.join(LABELS[c] for c in CODES if c in (codes or [])) or 'Hammasi'
