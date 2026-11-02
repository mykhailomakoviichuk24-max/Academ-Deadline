from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationQueue
from app.models.subject import Subject
from app.models.task import Task
from app.models.user import User


class NotificationRepository:
    """Used by the scheduler daemon (cross-user by design)."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def due(self, now: datetime) -> list[tuple[NotificationQueue, Task, Subject, User]]:
        q = (
            select(NotificationQueue, Task, Subject, User)
            .join(Task, Task.id == NotificationQueue.task_id)
            .join(Subject, Subject.id == Task.subject_id)
            .join(User, User.id == NotificationQueue.user_id)
            .where(NotificationQueue.trigger_time <= now, NotificationQueue.is_sent.is_(False))
            .order_by(NotificationQueue.trigger_time)
        )
        res = await self.session.execute(q)
        return [tuple(r) for r in res.all()]

    async def mark_sent(self, notification: NotificationQueue) -> None:
        notification.is_sent = True
        await self.session.commit()
