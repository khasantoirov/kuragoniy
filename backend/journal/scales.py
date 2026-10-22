"""Grading scales and the colour bands every mark falls into.

A class is graded on one of three scales — whatever the school uses:
0-5, 0-10 or 0-100. Every mark also gets a *level*, its colour band on a
common 0-5 footing (5 a'lo, 4 yaxshi, 3 qoniqarli, 2 qoniqarsiz, 1/0 yomon),
which is what the journal colours by and what the statistics average, so
classes on different scales can be compared. The frontend mirrors this
table in features/journal/scales.ts.
"""

SCALES = (5, 10, 100)

# Lowest mark of each band, a'lo down to qoniqarsiz. Below the qoniqarsiz
# minimum is yomon: level 1, or 0 for a mark of 0.
BAND_MIN = {
    5: {5: 5, 4: 4, 3: 3, 2: 2},
    10: {5: 9, 4: 7, 3: 5, 2: 3},
    100: {5: 86, 4: 71, 3: 56, 2: 31},
}


def level(mark: int, scale: int) -> int:
    for lvl in (5, 4, 3, 2):
        if mark >= BAND_MIN[scale][lvl]:
            return lvl
    if scale == 5:
        return mark  # 0 or 1
    return 0 if mark == 0 else 1


def band(lvl: int, scale: int) -> tuple[int, int]:
    """The marks of `scale` that fall into level `lvl`, as (lowest, highest)."""
    mins = BAND_MIN[scale]
    if lvl == 5:
        return mins[5], scale
    if lvl in (4, 3, 2):
        return mins[lvl], mins[lvl + 1] - 1
    if lvl == 1:
        return 1, mins[2] - 1
    return 0, 0


def convert(mark: int, old: int, new: int) -> int:
    """Carry a mark over to another scale: proportionally, but kept inside
    the same colour band (an 87 out of 100 is a'lo, so it becomes a 5, not
    the 4 plain rounding would give)."""
    if old == new:
        return mark
    lo, hi = band(level(mark, old), new)
    guess = int(mark / old * new + 0.5)
    return min(hi, max(lo, guess))
