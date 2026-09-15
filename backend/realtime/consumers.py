from channels.generic.websocket import AsyncJsonWebsocketConsumer


class AnnouncementConsumer(AsyncJsonWebsocketConsumer):
    """Global fanout group — every approved user connected here receives
    a push the moment announcements/signals.py fires on a new
    Announcement (replaces the old Firestore onSnapshot listener)."""

    group_name = 'announcements'

    async def connect(self):
        user = self.scope['user']
        if not user or not user.is_authenticated or not user.is_approved_effective:
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
        if not user or not user.is_authenticated:
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
