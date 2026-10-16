from channels.generic.websocket import AsyncJsonWebsocketConsumer


class AnnouncementConsumer(AsyncJsonWebsocketConsumer):
    """Global fanout group — every approved user connected here receives
    a push the moment announcements/signals.py fires on a new
    Announcement (replaces the old Firestore onSnapshot listener)."""

    group_name = 'announcements'

    async def connect(self):
        user = self.scope['user']
        # Staff only — announcements are for teachers/admins, and a student
        # account is approved too (for the student portal), so
        # is_approved_effective alone would let them in.
        if not user or not user.is_authenticated or not user.is_staff_member:
            await self.close(code=4401)
            return
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def announcement_created(self, event):
        await self.send_json(event['payload'])


class TranslationConsumer(AsyncJsonWebsocketConsumer):
    """Per-lesson group — the Python Telegram bot's translation worker
    publishes here when it finishes writing _ru/_en fields on a Lesson."""

    async def connect(self):
        user = self.scope['user']
        if not user or not user.is_authenticated or not user.is_staff_member:
            await self.close(code=4401)
            return
        lesson_id = self.scope['url_route']['kwargs']['lesson_id']
        self.group_name = f'lesson_translation_{lesson_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def translation_done(self, event):
        await self.send_json(event['payload'])


class GameConsumer(AsyncJsonWebsocketConsumer):
    """Live-quiz fanout: the host and the joined players of one session
    get a bare "changed" ping on every transition and refetch their own
    state over REST (games/views.py), so nothing per-user — like the
    correct answer before the reveal — ever goes over this socket."""

    async def connect(self):
        from channels.db import database_sync_to_async

        from games.views import is_session_member

        user = self.scope['user']
        session_id = self.scope['url_route']['kwargs']['session_id']
        allowed = await database_sync_to_async(is_session_member)(user, session_id)
        if not allowed:
            await self.close(code=4403)
            return
        self.group_name = f'game_{session_id}'
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def game_changed(self, event):
        await self.send_json({'type': 'changed'})
