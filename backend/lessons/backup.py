"""Builds the canonical lessons+experiments JSON export — shared by the
on-edit trigger (signals.py) and the Telegram bot's 24-hour scheduled
backup (telegrambot/bot/lessons_backup.py). Matches AdminPage.tsx's
"Darslarni eksport (JSON)" button exactly (both are just LessonSerializer
output), so the file either one produces can be fed straight back into
"Darslarni import qilish" if content ever needs restoring.
"""

import json

from django.utils import timezone


def build_lessons_backup() -> tuple[bytes, str]:
    from .models import Lesson
    from .serializers import LessonSerializer

    lessons = Lesson.objects.prefetch_related('experiments').order_by('grade', 'chorak', 'hafta')
    payload = json.dumps(LessonSerializer(lessons, many=True).data, ensure_ascii=False, indent=1).encode('utf-8')
    filename = f"darslar_{timezone.localtime().strftime('%Y-%m-%d_%H-%M-%S')}.json"
    return payload, filename
