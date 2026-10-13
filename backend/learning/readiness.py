"""Teacher readiness check ("Darsga tayyormisiz?").

Builds a short quiz from what the lesson itself contains — its experiments
(equipment, step order, safety, timing, descriptions), its formulas and
goal — plus any questions admins wrote for teachers, so the platform can
check a teacher prepared before walking into class without anyone having
to hand-author a test for every lesson.
"""

import random

from lessons.models import Experiment, Lesson

from .grading import generated_item, question_to_item
from .models import LessonMaterial, Question

PASS_PERCENT = 70
TARGET_QUESTIONS = 10
_rng = random.SystemRandom()


def _short(text, limit=150) -> str:
    text = ' '.join(str(text or '').split())
    return text if len(text) <= limit else text[: limit - 1] + '…'


def _equipment(exp) -> list[str]:
    """Experiment equipment names, whether stored as the flat `materials`
    list or as EquipmentItem rows."""
    mats = getattr(exp, 'materials', None)
    if isinstance(mats, list):
        return [_short(m, 80) for m in mats if str(m).strip()]
    items = getattr(exp, 'equipment_items', None)
    if items is not None:
        return [_short(i.name, 80) for i in items.all()]
    return []


def _distinct(values, exclude=()) -> list[str]:
    seen = {v.lower() for v in exclude}
    out = []
    for v in values:
        key = v.lower()
        if v and key not in seen:
            seen.add(key)
            out.append(v)
    return out


def _sample(pool, n):
    return _rng.sample(pool, min(n, len(pool)))


def _equipment_questions(exp, pool):
    mats = _distinct(_equipment(exp))
    others = _distinct(pool, exclude=mats)
    out = []
    if mats and len(others) >= 3:
        right = _rng.choice(mats)
        out.append((f"«{exp.name}» tajribasi uchun quyidagilardan qaysi biri kerak bo'ladi?",
                    [right, *_sample(others, 3)], right))
    if len(mats) >= 3 and others:
        wrong = _rng.choice(others)
        out.append((f"«{exp.name}» tajribasida quyidagilardan qaysi biri ishlatilMAYDI?",
                    [wrong, *_sample(mats, 3)], wrong))
    return out


def _step_questions(exp):
    steps = _distinct([_short(s, 140) for s in (exp.steps or []) if str(s).strip()])
    out = []
    if len(steps) >= 3:
        out.append((f"«{exp.name}» tajribasi qaysi bosqichdan boshlanadi?", [steps[0], *_sample(steps[1:], 3)], steps[0]))
        k = _rng.randrange(0, len(steps) - 1)
        rest = [s for i, s in enumerate(steps) if i not in (k, k + 1)]
        if len(rest) >= 2:
            out.append((f"«{exp.name}» tajribasida «{steps[k]}» bosqichidan keyin nima qilinadi?",
                        [steps[k + 1], *_sample(rest, 3)], steps[k + 1]))
    return out


def _safety_question(exp, safety_pool):
    own = _short(exp.safety, 160)
    others = _distinct(safety_pool, exclude=[own])
    if own and len(others) >= 2:
        return [(f"«{exp.name}» tajribasida qaysi xavfsizlik talabiga rioya qilinadi?", [own, *_sample(others, 3)], own)]
    return []


def _duration_question(exp):
    m = exp.minutes
    if not m:
        return []
    variants = _distinct([f'{m} daqiqa', f'{m + 5} daqiqa', f'{max(1, m // 2)} daqiqa', f'{m * 2} daqiqa'])
    if len(variants) < 3:
        return []
    return [(f"«{exp.name}» tajribasiga dars rejasida taxminan qancha vaqt ajratilgan?", variants, f'{m} daqiqa')]


def _description_question(exp, names_pool):
    if not exp.desc:
        return []
    others = _distinct(names_pool, exclude=[exp.name])
    if len(others) < 2:
        return []
    return [(f"Quyidagi tavsif qaysi tajribaga tegishli?\n«{_short(exp.desc, 200)}»", [exp.name, *_sample(others, 3)], exp.name)]


def _formula_questions(formulas, pool):
    out = []
    exprs = [_short(f.get('expr'), 80) for f in formulas if isinstance(f, dict) and f.get('expr')]
    for f in formulas:
        if not isinstance(f, dict) or not f.get('expr') or not f.get('desc'):
            continue
        expr = _short(f['expr'], 80)
        others = _distinct([*exprs, *pool], exclude=[expr])
        if len(others) >= 3:
            out.append((f"«{_short(f['desc'], 120)}» qaysi formula bilan ifodalanadi?", [expr, *_sample(others, 3)], expr))
    return out


def _goal_question(lesson, goals_pool):
    goal = _short(lesson.goal, 180)
    others = _distinct(goals_pool, exclude=[goal])
    if goal and len(others) >= 3:
        return [(f"«{lesson.title}» darsining maqsadi qaysi?", [goal, *_sample(others, 3)], goal)]
    return []


def build_readiness_snapshot(lesson: Lesson) -> list[dict]:
    """Returns snapshot items (see grading.py) — empty when the lesson has
    too little content to ask anything meaningful."""
    experiments = list(lesson.experiments.all())
    neighbours = list(
        Experiment.objects.filter(lesson__grade=lesson.grade).exclude(lesson=lesson).order_by('?')[:60]
    )

    equipment_pool = [m for e in neighbours for m in _equipment(e)]
    safety_pool = [_short(e.safety, 160) for e in neighbours if e.safety]
    names_pool = [e.name for e in experiments] + [e.name for e in neighbours]

    material = LessonMaterial.objects.filter(lesson=lesson).first()
    formulas = (material.formulas if material else []) or []
    formula_pool = []
    for m in LessonMaterial.objects.filter(lesson__grade=lesson.grade).exclude(lesson=lesson)[:40]:
        formula_pool += [_short(f.get('expr'), 80) for f in (m.formulas or []) if isinstance(f, dict) and f.get('expr')]
    goals_pool = [
        _short(g, 180)
        for g in Lesson.objects.filter(grade=lesson.grade).exclude(pk=lesson.pk).exclude(goal='').values_list('goal', flat=True)[:40]
    ]

    # Category buckets, drawn round-robin so one long experiment can't
    # crowd out formulas/theory.
    buckets: dict[str, list] = {'tajriba': [], 'formula': [], 'nazariya': []}
    for exp in experiments:
        buckets['tajriba'] += _equipment_questions(exp, equipment_pool)
        buckets['tajriba'] += _step_questions(exp)
        buckets['tajriba'] += _safety_question(exp, safety_pool)
        buckets['tajriba'] += _duration_question(exp)
        buckets['tajriba'] += _description_question(exp, names_pool)
    buckets['formula'] += _formula_questions(formulas, formula_pool)
    buckets['nazariya'] += _goal_question(lesson, goals_pool)
    for b in buckets.values():
        _rng.shuffle(b)

    items: list[dict] = []
    # Admin-written teacher questions first, then a few student-bank
    # theory/formula/problem questions for the same lesson.
    bank = list(Question.objects.filter(lesson=lesson, audience=Question.Audience.TEACHER).order_by('?')[:5])
    bank += list(
        Question.objects.filter(lesson=lesson, audience=Question.Audience.STUDENT, assignment__isnull=True)
        .order_by('?')[:3]
    )
    for q in bank:
        if len(items) >= TARGET_QUESTIONS:
            break
        items.append(question_to_item(q))

    index = 0
    order = ['tajriba', 'formula', 'nazariya', 'tajriba']
    while len(items) < TARGET_QUESTIONS and any(buckets.values()):
        for topic in order:
            if len(items) >= TARGET_QUESTIONS:
                break
            if buckets[topic]:
                text, options, right = buckets[topic].pop()
                index += 1
                items.append(generated_item(index, text, options, right, topic))
    return items
