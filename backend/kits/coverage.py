"""Which kit a lesson needs: the lesson's experiments' equipment against a
kit's contents, matched by equipment_key (case, apostrophes and spacing
don't matter). A lesson needs each piece as many times as its most
demanding experiment does — the same piece serves the next experiment."""

from collections import defaultdict

from lessons.models import EquipmentItem

from .models import KitItem

# Ko'ragoniy has no equipment catalogue (Amaliy Fizika's lessons.LabEquipment):
# the name match lives here, the same rule as there.
_APOSTROPHES = str.maketrans({c: "'" for c in '‘’ʻʼ`´'})


def equipment_key(name: str) -> str:
    """Case, apostrophe style, inner spacing and trailing punctuation don't matter."""
    s = ' '.join((name or '').translate(_APOSTROPHES).lower().split())
    return s.strip(' .,;:')


def lesson_needs(lesson_ids=None) -> dict[int, dict[str, dict]]:
    """{lesson id: {key: {"name", "quantity"}}} — all lessons when None."""
    qs = EquipmentItem.objects.all()
    if lesson_ids is not None:
        qs = qs.filter(experiment__lesson_id__in=list(lesson_ids))
    out: dict[int, dict[str, dict]] = defaultdict(dict)
    # the first name met, in the lesson's own order, is the one shown
    qs = qs.order_by('experiment__order', 'experiment_id', 'order', 'id')
    for lesson_id, name, qty in qs.values_list('experiment__lesson_id', 'name', 'quantity'):
        key = equipment_key(name)
        if not key:
            continue
        row = out[lesson_id].get(key)
        if row is None:
            out[lesson_id][key] = {'name': name.strip(), 'quantity': max(1, qty or 1)}
        else:
            row['quantity'] = max(row['quantity'], qty or 1)
    return out


def kit_contents(kit_ids=None) -> dict[int, dict[str, int]]:
    qs = KitItem.objects.all()
    if kit_ids is not None:
        qs = qs.filter(kit_id__in=list(kit_ids))
    out: dict[int, dict[str, int]] = defaultdict(dict)
    for kit_id, key, qty in qs.values_list('kit_id', 'key', 'quantity'):
        out[kit_id][key] = qty
    return out


def cover(needs: dict[str, dict], contents: dict[str, int]) -> dict:
    """How far a kit covers a lesson: percent of its pieces it has enough
    of, and what is short (with how many more)."""
    missing = []
    covered = 0
    for key, need in needs.items():
        have = contents.get(key, 0)
        if have >= need['quantity']:
            covered += 1
        else:
            missing.append({'name': need['name'], 'quantity': need['quantity'], 'short': need['quantity'] - have})
    missing.sort(key=lambda m: m['name'].lower())
    return {'percent': round(100 * covered / len(needs)) if needs else 0, 'missing': missing}


def prices(keys) -> dict[str, dict]:  # noqa: ARG001 — no catalogue on Ko'ragoniy
    """No prices or photos here: Ko'ragoniy has no equipment catalogue."""
    return {}


def viewer_school_ids(user) -> set[int]:
    """Partner schools whose kits count as "ours" for this person: where
    they teach, or (a school's ma'muriyat) the schools they run."""
    from schools.access import managed_school_ids
    from schools.models import SchoolTeacher

    ids = set(SchoolTeacher.objects.filter(teacher=user).values_list('school_id', flat=True))
    if getattr(user, 'is_school_admin', False):
        ids |= managed_school_ids(user)
    return ids
