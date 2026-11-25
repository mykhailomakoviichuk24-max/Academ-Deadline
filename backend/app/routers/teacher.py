import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import require_teacher
from app.models.enums import ReviewStatus
from app.models.user import User
from app.schemas import (
    AssignmentCreate,
    AssignmentOut,
    GroupCreate,
    GroupOut,
    ReviewRequest,
    StudentStats,
    TeacherAnalytics,
    TeacherTaskOut,
)
from app.services.teacher_service import TeacherService

router = APIRouter(prefix="/api/teacher", tags=["teacher"])


def _service(
    teacher: User = Depends(require_teacher), session: AsyncSession = Depends(get_session)
) -> TeacherService:
    return TeacherService(session, teacher)


@router.get("/groups", response_model=list[GroupOut])
async def list_groups(svc: TeacherService = Depends(_service)):
    return await svc.list_groups()


@router.post("/groups", response_model=GroupOut, status_code=201)
async def create_group(data: GroupCreate, svc: TeacherService = Depends(_service)):
    return await svc.create_group(data.name)


@router.get("/analytics", response_model=TeacherAnalytics)
async def analytics(
    group_id: uuid.UUID | None = None,
    days: int = Query(14, ge=1, le=60),
    svc: TeacherService = Depends(_service),
):
    return await svc.analytics(group_id, days)


@router.get("/groups/{group_id}/students", response_model=list[StudentStats])
async def group_students(group_id: uuid.UUID, svc: TeacherService = Depends(_service)):
    return await svc.students_stats(group_id)


@router.delete("/groups/{group_id}/students/{student_id}", status_code=204)
async def remove_student(
    group_id: uuid.UUID, student_id: uuid.UUID, svc: TeacherService = Depends(_service)
):
    await svc.remove_student(group_id, student_id)


@router.post("/assignments", response_model=AssignmentOut, status_code=201)
async def assign(data: AssignmentCreate, svc: TeacherService = Depends(_service)):
    return AssignmentOut(created=await svc.assign(data))


@router.get("/tasks", response_model=list[TeacherTaskOut])
async def list_tasks(
    group_id: uuid.UUID | None = None,
    status: ReviewStatus | None = None,
    svc: TeacherService = Depends(_service),
):
    return await svc.list_tasks(group_id, status)


@router.patch("/tasks/{task_id}/review", response_model=TeacherTaskOut)
async def review(task_id: uuid.UUID, data: ReviewRequest, svc: TeacherService = Depends(_service)):
    return await svc.review(task_id, data)


@router.delete("/tasks/{task_id}", status_code=204)
async def cancel(task_id: uuid.UUID, svc: TeacherService = Depends(_service)):
    await svc.cancel(task_id)
