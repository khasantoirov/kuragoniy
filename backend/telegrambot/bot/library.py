"""📚 Kutubxona — a persistent reply-keyboard button (attached to the
/start welcome in handlers.py) that sends every library item with an
uploaded file (library.models.LibraryItem — kitob/qollanma, see
LibraryItemViewSet.upload_file) straight to the chat as a document.

Items that are just an external link (kind=video/havola, or a kitob/
qollanma someone linked instead of uploaded) have no file to send, so
they're skipped here — those stay reachable only from the app's own
Kutubxona page. Doesn't require a linked account: the library is public
reference material inside the app too (LibraryPage has no role gate on
reading), so there's nothing to gate here either.
"""

import html
import logging
import os

from aiogram import F, Router
from aiogram.types import FSInputFile, KeyboardButton, Message, ReplyKeyboardMarkup
from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)
router = Router(name="library")

LIBRARY_BUTTON_TEXT = "📚 Kutubxona"

_KIND_ICON = {'kitob': '📕', 'qollanma': '📗'}

# library.views.LIBRARY_FILE_MAX_MB allows uploads up to 150MB, but
# Telegram's Bot API hard-caps a bot's own uploads at 50MB (only a
# self-hosted Bot API server lifts that, which this project doesn't run) —
# so a large textbook can be stored and downloadable from the app just fine
# while still being too big for the bot to ever send.
_TELEGRAM_BOT_UPLOAD_LIMIT = 50 * 1024 * 1024


def main_menu_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(keyboard=[[KeyboardButton(text=LIBRARY_BUTTON_TEXT)]], resize_keyboard=True)


def _files_sync() -> list[tuple[str, str]]:
    from library.models import LibraryItem

    items = (
        LibraryItem.objects.exclude(file='').exclude(file__isnull=True)
        .order_by('grade', 'title')
    )
    out = []
    for item in items:
        # Titles are admin-authored (LibraryEditor is admin-gated) but still
        # free text — a bare '<'/'&' (e.g. a title with an inequality) would
        # otherwise break Telegram's HTML parser and drop the whole send,
        # same reasoning as common/audit.py's _compose_message.
        label = f"{_KIND_ICON.get(item.kind, '📄')} {html.escape(item.title)}"
        if item.grade:
            label += f" ({item.grade}-sinf)"
        out.append((item.file.path, label))
    return out


_files = sync_to_async(_files_sync)


@router.message(F.text == LIBRARY_BUTTON_TEXT)
async def send_library(message: Message):
    files = await _files()
    if not files:
        await message.answer("Kutubxonada hozircha yuklangan fayl yo'q.")
        return

    await message.answer(f"📚 Kutubxona — {len(files)} ta fayl:")
    for path, label in files:
        try:
            if os.path.getsize(path) > _TELEGRAM_BOT_UPLOAD_LIMIT:
                await message.answer(f"{label}\n⚠️ Fayl hajmi katta, Telegram orqali yuborib bo'lmaydi — ilovadagi Kutubxona bo'limidan yuklab oling.")
                continue
            await message.answer_document(FSInputFile(path), caption=label)
        except Exception:
            logger.exception("Failed to send library file %s", path)
