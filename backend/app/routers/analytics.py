from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.user import User
from app.repositories.subject_repository import SubjectRepository
from app.repositories.task_repository import TaskRepository
from app.schemas import WorkloadOut
from app.services.workload_service import WorkloadService

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/workload", response_model=WorkloadOut)
async def workload(
    range: Literal["day", "week", "month"] = "week",
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await WorkloadService(TaskRepository(session), SubjectRepository(session)).calculate(user.id, range)
