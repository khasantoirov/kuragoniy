"""Optional sections the administration can switch off (Boshqaruv →
Modullar). Off hides a section from the menu, the tabs and the student
portal; its data stays and is there again once it is switched back on.
The keys match the frontend's lib/modules.ts (a platform shows only the
ones it has)."""

from django.apps import apps

from .models import PlatformSettings

MODULES = ('lab', 'library', 'timetable', 'assignments', 'games', 'reports', 'readiness', 'shop', 'equipment', 'poster')


def state() -> dict:
    stored = PlatformSettings.get().modules or {}
    return {key: stored.get(key) is not False for key in MODULES}


def _count(label, **filters):
    try:
        model = apps.get_model(label)
    except LookupError:
        return 0
    return model.objects.filter(**filters).count()


def usage() -> dict:
    """How much each section holds — the administration sees what nobody
    uses before switching it off. None: nothing stored on the server."""
    return {
        'lab': None,
        'library': _count('library.LibraryItem'),
        'timetable': _count('timetable.TimetableSlot'),
        'assignments': _count('learning.Assignment'),
        'games': _count('games.Quiz') + _count('games.GameSession') + _count('games.MiniGameScore'),
        'reports': _count('learning.LessonReport'),
        'readiness': _count('learning.Attempt', kind='readiness'),
        'shop': _count('shop.Product') + _count('shop.Order'),
        'equipment': _count('lessons.LabEquipment') + _count('lessons.EquipmentSheet'),
        'poster': _count('lessons.LessonPoster'),
    }
