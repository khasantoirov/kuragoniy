"""Grouping key for JournalClass.school — a free-text field a teacher types
by hand (see ClassModal.tsx's plain <input>), so the same real school can
end up spelled several ways ("25-maktab", "25 maktab", "25  Maktab").

normalize_school() collapses only whitespace/case/separator differences —
never anything that guesses meaning (no fuzzy/Levenshtein matching). Two
different schools must never merge; "26-maktab" stays separate from
"25-maktab" no matter how the aggregation groups by key.
"""

import re
from collections import Counter

_SEP_RUN = re.compile(r'[\s\-‐-―_]+')

#: The sentinel key for the "school not filled in" bucket — a real,
#: distinguishable value distinct from any string a teacher could type,
#: so it round-trips through a query string unambiguously.
BLANK_SCHOOL_KEY = '__none__'


def normalize_school(raw: str) -> str:
    """Collapse whitespace/case/separator differences into one grouping key.

    "25-maktab", "25 maktab", "25  Maktab", "25—maktab" -> "25-maktab".
    "" -> "" (the caller maps that to BLANK_SCHOOL_KEY for display/filtering;
    kept as '' here so grouping-by-key stays a pure string operation).
    """
    text = raw.strip()
    if not text:
        return ''
    return _SEP_RUN.sub('-', text).casefold()


def pick_label(raw_values) -> tuple[str, list[str]]:
    """Given every raw spelling seen for one normalized key, pick a display
    label (the most frequent spelling; ties broken lexicographically for
    determinism) and the sorted list of distinct spellings.

    Returns (label, variants) — variants has length 1 when there was only
    ever one spelling, so callers can test `len(variants) > 1` to decide
    whether to surface a "N xil yozilgan" hint.
    """
    counts = Counter(raw_values)
    variants = sorted(counts)
    top_count = max(counts.values())
    # Ties broken lexicographically for determinism (a real tie between two
    # equally common spellings has no other principled way to pick one).
    label = min(v for v, c in counts.items() if c == top_count)
    return label, variants
