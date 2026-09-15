"""
Lesson translation worker — consumes TranslationJob rows (created by
lessons/signals.py whenever a Lesson's content changes) pushed via the
'translation_jobs' Channels group, calls the Google Cloud Translation
API v2 REST endpoint for ru+en, and writes back the _ru/_en fields on
Lesson and its Experiments. Ported from the old bot/index.js
watchLessons(), which did the same over a Firestore onSnapshot listener.

Silently does nothing if GOOGLE_TRANSLATE_API_KEY isn't set — lesson
content just stays Uzbek-only, matching the old bot's documented
behavior.
"""

import logging
import os

import httpx
from aiogram import Bot
from asgiref.sync import sync_to_async
from channels.layers import get_channel_layer
from django.db import transaction
from django.utils import timezone

from lessons.models import Experiment, Lesson
from telegrambot.models import TranslationJob

logger = logging.getLogger(__name__)

GROUP_NAME = "translation_jobs"
TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2"
TARGET_LANGS = ("ru", "en")


def _collect_texts(lesson: Lesson):
    """Flattens every translatable field into one ordered list, plus a
    parallel list of (setter) callables to write each translation back."""
    texts: list[str] = []
    setters: list = []

    def add(text, setter):
        texts.append(text or "")
        setters.append(setter)

    add(lesson.title, lambda v, lang: setattr(lesson, f"title_{lang}", v))
    add(lesson.goal, lambda v, lang: setattr(lesson, f"goal_{lang}", v))

    experiments = list(lesson.experiments.all().order_by("order"))
    for exp in experiments:
        add(exp.name, lambda v, lang, e=exp: setattr(e, f"name_{lang}", v))
        add(exp.desc, lambda v, lang, e=exp: setattr(e, f"desc_{lang}", v))
        add(exp.safety, lambda v, lang, e=exp: setattr(e, f"safety_{lang}", v))

        for i in range(len(exp.materials)):
            add(exp.materials[i], lambda v, lang, e=exp, idx=i: _set_list_item(e, "materials", lang, idx, v))
        for i in range(len(exp.steps)):
            add(exp.steps[i], lambda v, lang, e=exp, idx=i: _set_list_item(e, "steps", lang, idx, v))

    return texts, setters, experiments


def _set_list_item(exp: Experiment, field: str, lang: str, idx: int, value: str):
    target_field = f"{field}_{lang}"
    lst = getattr(exp, target_field)
    if not isinstance(lst, list) or len(lst) != len(getattr(exp, field)):
        lst = list(getattr(exp, field))  # reset to source length, will be overwritten in place
    while len(lst) <= idx:
        lst.append("")
    lst[idx] = value
    setattr(exp, target_field, lst)


async def _translate_batch(client: httpx.AsyncClient, api_key: str, texts: list[str], target: str) -> list[str]:
    non_empty_idx = [i for i, t in enumerate(texts) if t.strip()]
    if not non_empty_idx:
        return ["" for _ in texts]

    resp = await client.post(
        TRANSLATE_URL,
        params={"key": api_key},
        json={"q": [texts[i] for i in non_empty_idx], "target": target, "source": "uz", "format": "text"},
        timeout=30,
    )
    resp.raise_for_status()
    translated = [t["translatedText"] for t in resp.json()["data"]["translations"]]

    out = ["" for _ in texts]
    for i, value in zip(non_empty_idx, translated):
        out[i] = value
    return out


@sync_to_async
def _next_pending_job():
    return TranslationJob.objects.filter(status=TranslationJob.Status.PENDING).select_related("lesson").first()


@sync_to_async
@transaction.atomic
def _apply_translations(job: TranslationJob, setters, experiments, results: dict[str, list[str]]):
    lesson = job.lesson
    for lang, values in results.items():
        for setter, value in zip(setters, values):
            setter(value, lang)

    lesson.translated_at = timezone.now()
    lesson.save()
    for exp in experiments:
        exp.save()

    job.status = TranslationJob.Status.DONE
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "finished_at"])
    return lesson.id


@sync_to_async
def _mark_job_error(job: TranslationJob, error: str):
    job.status = TranslationJob.Status.ERROR
    job.error = error[:2000]
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "error", "finished_at"])


async def _process_job(client: httpx.AsyncClient, api_key: str, job: TranslationJob):
    job.status = TranslationJob.Status.RUNNING
    await sync_to_async(job.save)(update_fields=["status"])

    lesson = await sync_to_async(lambda: job.lesson)()
    texts, setters, experiments = await sync_to_async(_collect_texts)(lesson)

    try:
        results = {}
        for lang in TARGET_LANGS:
            results[lang] = await _translate_batch(client, api_key, texts, lang)
        lesson_id = await _apply_translations(job, setters, experiments, results)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Translation failed for lesson %s", job.lesson_id)
        await _mark_job_error(job, str(exc))
        return

    channel_layer = get_channel_layer()
    await channel_layer.group_send(
        f"lesson_translation_{lesson_id}",
        {"type": "translation.done", "payload": {"lesson_id": lesson_id}},
    )


async def watch_translation_jobs(bot: Bot):  # noqa: ARG001 — bot kept for a consistent watcher signature
    api_key = os.environ.get("GOOGLE_TRANSLATE_API_KEY")
    if not api_key:
        logger.info("GOOGLE_TRANSLATE_API_KEY not set — lesson translation disabled.")
        return

    channel_layer = get_channel_layer()
    channel_name = await channel_layer.new_channel()
    await channel_layer.group_add(GROUP_NAME, channel_name)
    logger.info("Listening for translation jobs on Channels group '%s'", GROUP_NAME)

    async with httpx.AsyncClient() as client:
        # Drain any jobs already pending at startup (e.g. bot was offline).
        job = await _next_pending_job()
        while job:
            await _process_job(client, api_key, job)
            job = await _next_pending_job()

        while True:
            try:
                await channel_layer.receive(channel_name)
            except Exception:
                # Same rationale as announcements.py: a receive()
                # timeout/hiccup is normal idle behavior, not fatal.
                logger.warning("Transient error while waiting for translation jobs, retrying", exc_info=True)
                continue
            job = await _next_pending_job()
            while job:
                await _process_job(client, api_key, job)
                job = await _next_pending_job()
