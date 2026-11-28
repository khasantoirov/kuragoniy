"""📅 Bugungi darslarim — a reply-keyboard button (library.main_menu_keyboard)
that answers with the linked teacher's lessons today
(staffroom/reminders.today_for) and «Jadvalni ochish» under it — the
timetable in the mini app. The morning reminder still comes by itself;
this is for any time of the day."""

from aiogram import F, Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo
from asgiref.sync import sync_to_async

from .library import TODAY_BUTTON_TEXT

router = Router(name="today")


def _answer_sync(chat_id: int) -> tuple[str | None, str | None]:
    from accounts.models import User
    from common.audit import app_link
    from staffroom.reminders import today_for

    user = User.objects.filter(telegram_chat_id=chat_id, telegram_linked=True, is_active=True).first()
    if user is None:
        return None, None
    return today_for(user), app_link('/timetable')


@router.message(F.text == TODAY_BUTTON_TEXT)
async def todays_lessons(message: Message):
    text, link = await sync_to_async(_answer_sync)(message.chat.id)
    if text is None:
        await message.answer("Hisobingiz ulanmagan. Avval platformada «Telegramni ulash» tugmasini bosing.")
        return
    markup = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="📅 Jadvalni ochish", web_app=WebAppInfo(url=link)),
    ]]) if link else None
    # school and class names are free text: plain, not HTML
    await message.answer(text, reply_markup=markup, parse_mode=None)
