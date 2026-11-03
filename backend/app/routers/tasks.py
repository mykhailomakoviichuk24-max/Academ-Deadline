import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.enums import ReviewStatus
from app.models.user import User
from app.repositories.subject_repository import SubjectRepository
from app.repositories.task_repository import TaskRepository
from app.schemas import TaskCreate, TaskOut, TaskProgressUpdate, TaskStatusUpdate, TaskUpdate
from app.services.task_service import TaskService

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _service(session: AsyncSession = Depends(get_session)) -> TaskService:
    return TaskService(TaskRepository(session), SubjectRepository(session))


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    subject_id: uuid.UUID | None = None,
    status: ReviewStatus | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    user: User = Depends(get_current_user),
    svc: TaskService = Depends(_service),
):
    return await svc.tasks.list(user.id, subject_id, status, from_date, to_date)


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    data: TaskCreate, user: User = Depends(get_current_user), svc: TaskService = Depends(_service)
):
    return await svc.create(user.id, data)


@router.patch("/{task_id}/status", response_model=TaskOut)
async def update_status(
    task_id: uuid.UUID,
    data: TaskStatusUpdate,
    user: User = Depends(get_current_user),
    svc: TaskService = Depends(_service),
):
    return await svc.update_status(user.id, task_id, data)


@router.patch("/{task_id}/progress", response_model=TaskOut)
async def update_progress(
    task_id: uuid.UUID,
    data: TaskProgressUpdate,
    user: User = Depends(get_current_user),
    svc: TaskService = Depends(_service),
):
    return await svc.update_progress(user.id, task_id, data.progress)


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: uuid.UUID,
    data: TaskUpdate,
    user: User = Depends(get_current_user),
    svc: TaskService = Depends(_service),
):
    return await svc.update(user.id, task_id, data)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: uuid.UUID, user: User = Depends(get_current_user), svc: TaskService = Depends(_service)
):
    await svc.delete(user.id, task_id)
