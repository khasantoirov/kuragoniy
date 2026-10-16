"""Question snapshots and server-side grading.

An attempt's question set is frozen into Attempt.snapshot when it starts:
options are shuffled per attempt (so "the answer is B" can't be passed
around a class), and correct answers live only in the snapshot, which is
never serialized to the student before submission.
"""

import math
import random
import re

from django.utils import timezone

from .models import Question

_rng = random.SystemRandom()

# Fields of a snapshot item that must never reach the client before the
# attempt is submitted.
SECRET_KEYS = ('correct', 'answer_value', 'tolerance_pct', 'explanation', 'qid')


def normalize_text(s) -> str:
    s = str(s or '').strip().lower()
    s = re.sub(r"[ʻʼ‘’`´]", "'", s)
    return re.sub(r'\s+', ' ', s)


def parse_number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value) if math.isfinite(value) else None
    s = str(value or '').strip().replace(' ', '').replace(',', '.')
    if not s:
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def question_to_item(q: Question) -> dict:
    item = {
        'id': f'q{q.id}',
        'qid': q.id,
        'kind': q.kind,
        'topic': q.topic,
        'text': q.text,
        'image_url': q.image_url,
        'unit': q.unit,
        'points': q.points or 1,
        'explanation': q.explanation,
    }
    if q.kind in (Question.Kind.TEST, Question.Kind.MULTI):
        options = [str(o) for o in (q.options or [])]
        order = list(range(len(options)))
        _rng.shuffle(order)
        item['options'] = [options[i] for i in order]
        valid = {c for c in (q.correct or []) if isinstance(c, int) and 0 <= c < len(options)}
        item['correct'] = sorted(order.index(c) for c in valid)
    elif q.kind == Question.Kind.NUMBER:
        item['answer_value'] = q.answer_value
        item['tolerance_pct'] = q.tolerance_pct if q.tolerance_pct is not None else 2.0
    else:
        item['correct'] = [normalize_text(c) for c in (q.correct or []) if str(c).strip()]
    return item


def generated_item(index: int, text: str, options: list[str], correct_option: str, topic: str) -> dict:
    """A test item built on the fly (readiness check) — same shape as
    question_to_item, already shuffled."""
    opts = list(dict.fromkeys(o for o in options if o))
    _rng.shuffle(opts)
    return {
        'id': f'g{index}',
        'qid': None,
        'kind': Question.Kind.TEST,
        'topic': topic,
        'text': text,
        'image_url': '',
        'unit': '',
        'points': 1,
        'explanation': f"To'g'ri javob: {correct_option}",
        'options': opts,
        'correct': [opts.index(correct_option)],
    }


def public_item(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in SECRET_KEYS}


def grade_item(item: dict, given) -> bool:
    kind = item.get('kind')
    if given is None or given == '' or given == []:
        return False
    if kind == Question.Kind.TEST:
        try:
            return [int(given)] == item.get('correct')
        except (TypeError, ValueError):
            return False
    if kind == Question.Kind.MULTI:
        if not isinstance(given, list):
            return False
        try:
            return sorted({int(g) for g in given}) == item.get('correct')
        except (TypeError, ValueError):
            return False
    if kind == Question.Kind.NUMBER:
        v = parse_number(given)
        expected = item.get('answer_value')
        if v is None or expected is None:
            return False
        tol = abs(float(expected)) * float(item.get('tolerance_pct') or 0) / 100
        return abs(v - float(expected)) <= max(tol, 1e-9)
    return normalize_text(given) in (item.get('correct') or [])


def grade_attempt(attempt, answers: dict) -> None:
    """Grades `answers` ({item id: given}) against attempt.snapshot and
    fills score/percent/results — caller saves. Unknown keys are dropped,
    so a client can't smuggle extra "answers" in."""
    answers = answers if isinstance(answers, dict) else {}
    clean, results = {}, {}
    score = max_score = 0.0
    for item in attempt.snapshot:
        pts = float(item.get('points') or 1)
        given = answers.get(item['id'])
        if isinstance(given, str):
            given = given[:200]
        ok = grade_item(item, given)
        clean[item['id']] = given
        results[item['id']] = {'ok': ok, 'pts': pts if ok else 0.0}
        max_score += pts
        if ok:
            score += pts
    now = timezone.now()
    attempt.answers = clean
    attempt.results = results
    attempt.score = score
    attempt.max_score = max_score
    attempt.percent = round(100 * score / max_score, 1) if max_score else 0.0
    attempt.submitted_at = now
    attempt.duration_sec = max(0, int((now - attempt.started_at).total_seconds()))


def review_items(attempt, reveal: bool) -> list[dict]:
    """Per-question breakdown for a submitted attempt. With reveal=False
    the student sees only right/wrong, not the correct answer."""
    out = []
    for item in attempt.snapshot:
        row = public_item(item)
        row['given'] = attempt.answers.get(item['id'])
        row['ok'] = attempt.results.get(item['id'], {}).get('ok', False)
        if reveal:
            row['correct'] = item.get('correct')
            row['answer_value'] = item.get('answer_value')
            row['explanation'] = item.get('explanation', '')
        out.append(row)
    return out
