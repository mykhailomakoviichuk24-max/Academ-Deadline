import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.models.enums import NotificationType, ReviewStatus
from app.models.notification import NotificationQueue
from app.models.task import Task
from app.repositories.subject_repository import SubjectRepository
from app.repositories.task_repository import TaskRepository
from app.schemas import TaskCreate, TaskStatusUpdate, TaskUpdate

OFFSETS: list[tuple[NotificationType, timedelta]] = [
    (NotificationType.THREE_DAYS_LEFT, timedelta(hours=72)),
    (NotificationType.ONE_DAY_LEFT, timedelta(hours=24)),
    (NotificationType.TWO_HOURS_LEFT, timedelta(hours=2)),
    (NotificationType.OVERDUE, timedelta(0)),
]


# statuses that only a teacher may set
REVIEWER_ONLY = (ReviewStatus.ACCEPTED, ReviewStatus.REQUIRES_CHANGES)


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


class TaskService:
    def __init__(self, tasks: TaskRepository, subjects: SubjectRepository):
        self.tasks = tasks
        self.subjects = subjects

    async def _ensure_subject(self, user_id: uuid.UUID, subject_id: uuid.UUID) -> None:
        if await self.subjects.get(user_id, subject_id) is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found")

    async def _get_or_404(self, user_id: uuid.UUID, task_id: uuid.UUID) -> Task:
        task = await self.tasks.get(user_id, task_id)
        if task is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
        return task

    def _schedule(self, task: Task) -> None:
        """Create NotificationQueue rows; skip triggers already in the past (except OVERDUE)."""
        now = datetime.now(timezone.utc)
        deadline = _aware(task.deadline)
        items = []
        for ntype, offset in OFFSETS:
            trigger = deadline - offset
            if ntype != NotificationType.OVERDUE and trigger <= now:
                continue
            items.append(
                NotificationQueue(
                    task_id=task.id, user_id=task.user_id, trigger_time=trigger, type=ntype
                )
            )
        self.tasks.add_notifications(items)

    async def _reschedule(self, task: Task) -> None:
        await self.tasks.delete_unsent_notifications(task.id)
        if task.status != ReviewStatus.ACCEPTED:
            self._schedule(task)

    async def create(
        self, user_id: uuid.UUID, data: TaskCreate, assigned_by: uuid.UUID | None = None
    ) -> Task:
        await self._ensure_subject(user_id, data.subject_id)
        task = Task(user_id=user_id, assigned_by=assigned_by, **data.model_dump())
        task.deadline = _aware(task.deadline)
        await self.tasks.add(task)
        self._schedule(task)
        await self.tasks.commit()
        return await self.tasks.refresh(task)

    async def update(self, user_id: uuid.UUID, task_id: uuid.UUID, data: TaskUpdate) -> Task:
        task = await self._get_or_404(user_id, task_id)
        self._forbid_if_assigned(task, "edit")
        if data.status in REVIEWER_ONLY and data.status != task.status:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Only the teacher can accept or return a task"
            )
        await self._ensure_subject(user_id, data.subject_id)
        deadline_changed = _aware(data.deadline) != _aware(task.deadline)
        for field, value in data.model_dump(exclude={"status", "review_notes"}).items():
            setattr(task, field, value)
        task.deadline = _aware(task.deadline)
        if data.review_notes is not None:
            task.review_notes = data.review_notes
        status_changed = data.status is not None and data.status != task.status
        if data.status is not None:
            task.status = data.status
        if task.status == ReviewStatus.ACCEPTED:
            task.progress = 100  # an accepted work is 100% ready
        if deadline_changed or status_changed:
            await self._reschedule(task)
        await self.tasks.commit()
        return await self.tasks.refresh(task)

    @staticmethod
    def _forbid_if_assigned(task: Task, action: str) -> None:
        if task.assigned_by is not None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, f"A task issued by a teacher cannot be {action}ed by the student"
            )

    async def update_status(
        self,
        user_id: uuid.UUID,
        task_id: uuid.UUID,
        data: TaskStatusUpdate,
        by_teacher: bool = False,
    ) -> Task:
        task = await self._get_or_404(user_id, task_id)
        if not by_teacher and (data.status in REVIEWER_ONLY or task.status == ReviewStatus.ACCEPTED):
            # a student can neither accept/return a task nor reopen an accepted one
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Only the teacher can accept or return a task"
            )
        task.status = data.status
        if data.status == ReviewStatus.ACCEPTED:
            task.progress = 100  # an accepted work is 100% ready
        if data.review_notes is not None:
            task.review_notes = data.review_notes
        deadline_changed = False
        if data.deadline is not None:
            deadline_changed = _aware(data.deadline) != _aware(task.deadline)
            task.deadline = _aware(data.deadline)

        if data.status == ReviewStatus.ACCEPTED:
            await self.tasks.skip_unsent_notifications(task.id)
        elif deadline_changed:
            await self._reschedule(task)
        else:
            # task re-opened (e.g. ACCEPTED -> REQUIRES_CHANGES): make sure alerts exist
            existing = await self.tasks.list_notifications(task.id)
            if not any(not n.is_sent for n in existing):
                await self._reschedule(task)
        await self.tasks.commit()
        return await self.tasks.refresh(task)

    async def update_progress(self, user_id: uuid.UUID, task_id: uuid.UUID, progress: int) -> Task:
        task = await self._get_or_404(user_id, task_id)
        task.progress = progress
        await self.tasks.commit()
        return await self.tasks.refresh(task)

    async def delete(self, user_id: uuid.UUID, task_id: uuid.UUID) -> None:
        task = await self._get_or_404(user_id, task_id)
        self._forbid_if_assigned(task, "delet")
        await self.tasks.delete(task)
