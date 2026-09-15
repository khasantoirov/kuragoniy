"""Two-way channel: a linked teacher's plain message to the bot is relayed
straight to every admin/boshliq/dev-superuser's Telegram, so they can
answer without the teacher needing to open the app or without the admin
needing to check the app. The reverse direction of common.audit's
one-way admin-action notifications.

Registered after handlers.router/backup_commands.router in main.py so
/start, /stop, /backup etc. are handled by their own routers first — this
catch-all only ever sees whatever's left, and the ``~F.text.startswith('/')``
filter additionally skips unrecognized commands so they don't get relayed
as if they were a real message.
"""

import html
import logging

from aiogram import F, Router
from aiogram.types import Message
from asgiref.sync import sync_to_async
from django.db.models import Q

from accounts.models import User

logger = logging.getLogger(__name__)
router = Router(name="replies")


def _sender_and_recipients_sync(chat_id: int):
    sender = User.objects.filter(telegram_chat_id=chat_id, telegram_linked=True).first()
    if not sender:
        return None, []
    recipients = list(
        User.objects.filter(telegram_linked=True)
        .filter(Q(is_dev_superuser=True) | Q(role__in=[User.Role.ADMIN, User.Role.BOSHLIQ]))
        .exclude(id=sender.id)
        .exclude(telegram_chat_id__isnull=True)
        .values_list('telegram_chat_id', flat=True)
    )
    return sender, recipients


_sender_and_recipients = sync_to_async(_sender_and_recipients_sync)


def _compose_relay_text(sender_name: str, message_text: str) -> str:
    # sender_name and message_text are both fully attacker-controlled by any
    # linked teacher (not just admins) — without escaping, either one could
    # inject real Telegram HTML (e.g. a disguised <a href> link) into a
    # message every admin sees, or just break parsing on a stray '<'/'&'
    # (plausible here: a physics teacher typing an inequality like "x < 5")
    # and silently drop the relay to every recipient at once.
    return f"💬 <b>{html.escape(sender_name)}</b> yozdi:\n{html.escape(message_text)}"


@router.message(F.text & ~F.text.startswith('/'))
async def relay_to_admins(message: Message):
    sender, recipients = await _sender_and_recipients(message.chat.id)

    if not sender:
        await message.answer("Hisobingiz ulanmagan. Avval platformada «Telegramni ulash» tugmasini bosing.")
        return

    if not recipients:
        await message.answer("Xabaringiz qabul qilindi, lekin hozircha yetkazish uchun aloqadagi administrator topilmadi.")
        return

    text = _compose_relay_text(sender.name, message.text)
    sent = 0
    for chat_id in recipients:
        try:
            await message.bot.send_message(chat_id, text)
            sent += 1
        except Exception:
            logger.exception("Failed to relay message to admin chat %s", chat_id)

    if sent:
        await message.answer("✅ Xabaringiz administratorlarga yuborildi.")
    else:
        await message.answer("Xabaringizni yuborishda xatolik yuz berdi, birozdan keyin urinib ko'ring.")
