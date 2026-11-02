from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ReviewStatus
from app.models.notification import NotificationQueue
from app.models.task import Task


class TaskRepository:
    """Every query is scoped by user_id (strict data isolation)."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(
        self,
        user_id: uuid.UUID,
        subject_id: uuid.UUID | None = None,
        status: ReviewStatus | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
    ) -> list[Task]:
        q = select(Task).where(Task.user_id == user_id)
        if subject_id:
            q = q.where(Task.subject_id == subject_id)
        if status:
            q = q.where(Task.status == status)
        if from_date:
            q = q.where(Task.deadline >= from_date)
        if to_date:
            q = q.where(Task.deadline <= to_date)
        res = await self.session.execute(q.order_by(Task.deadline))
        return list(res.scalars())

    async def get(self, user_id: uuid.UUID, task_id: uuid.UUID) -> Task | None:
        res = await self.session.execute(
            select(Task).where(Task.id == task_id, Task.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def add(self, task: Task) -> Task:
        self.session.add(task)
        await self.session.flush()
        return task

    async def commit(self) -> None:
        await self.session.commit()

    async def refresh(self, task: Task) -> Task:
        await self.session.refresh(task)
        return task

    async def delete(self, task: Task) -> None:
        await self.session.execute(
            delete(NotificationQueue).where(NotificationQueue.task_id == task.id)
        )
        await self.session.delete(task)
        await self.session.commit()

    # ---- notification queue ----
    def add_notifications(self, items: list[NotificationQueue]) -> None:
        self.session.add_all(items)

    async def delete_unsent_notifications(self, task_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(NotificationQueue).where(
                NotificationQueue.task_id == task_id, NotificationQueue.is_sent.is_(False)
            )
        )

    async def skip_unsent_notifications(self, task_id: uuid.UUID) -> None:
        """Mark unsent notifications as skipped (is_sent=True so the daemon ignores them)."""
        await self.session.execute(
            update(NotificationQueue)
            .where(NotificationQueue.task_id == task_id, NotificationQueue.is_sent.is_(False))
            .values(is_sent=True)
        )

    async def list_notifications(self, task_id: uuid.UUID) -> list[NotificationQueue]:
        res = await self.session.execute(
            select(NotificationQueue).where(NotificationQueue.task_id == task_id)
        )
        return list(res.scalars())
