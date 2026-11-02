"""SchedulerDaemon: polls NotificationQueue every N seconds and pushes Telegram messages."""
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot.service import TelegramBotService
from app.core.config import settings
from app.core.database import SessionLocal
from app.repositories.notification_repository import NotificationRepository

log = logging.getLogger(__name__)

SendFn = Callable[[int, str], Awaitable[None]]


async def process_due_notifications(session: AsyncSession, send: SendFn) -> int:
    """Send all due, unsent notifications. Returns number of messages sent."""
    repo = NotificationRepository(session)
    sent = 0
    for notification, task, subject, user in await repo.due(datetime.now(timezone.utc)):
        if user.telegram_chat_id is None:
            # user has no Telegram linked: nothing to deliver, don't retry forever
            await repo.mark_sent(notification)
            continue
        text = TelegramBotService.format_notification(notification.type, task, subject)
        try:
            await send(user.telegram_chat_id, text)
        except Exception:  # noqa: BLE001 - keep unsent, retry on next tick
            log.exception("Failed to send notification %s", notification.id)
            continue
        await repo.mark_sent(notification)
        sent += 1
    return sent


class SchedulerDaemon:
    def __init__(self, send: SendFn):
        self.send = send
        self.scheduler = AsyncIOScheduler(timezone="UTC")

    async def tick(self) -> None:
        async with SessionLocal() as session:
            await process_due_notifications(session, self.send)

    def start(self) -> None:
        self.scheduler.add_job(
            self.tick,
            "interval",
            seconds=settings.scheduler_interval_seconds,
            id="notifications",
            max_instances=1,
            coalesce=True,
        )
        self.scheduler.start()

    def stop(self) -> None:
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)
