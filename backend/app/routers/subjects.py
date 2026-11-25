import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_user, require_teacher
from app.models.subject import Subject
from app.models.user import User
from app.repositories.subject_repository import SubjectRepository
from app.schemas import SubjectCreate, SubjectOut, SubjectUpdate

router = APIRouter(prefix="/api/subjects", tags=["subjects"])


def _repo(session: AsyncSession = Depends(get_session)) -> SubjectRepository:
    return SubjectRepository(session)


async def _get_or_404(repo: SubjectRepository, user: User, subject_id: uuid.UUID) -> Subject:
    subject = await repo.get(user.id, subject_id)
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subject not found")
    return subject


# Subjects are managed by teachers; students only read the ones they received.
@router.get("", response_model=list[SubjectOut])
async def list_subjects(user: User = Depends(get_current_user), repo=Depends(_repo)):
    return await repo.list(user.id)


@router.post("", response_model=SubjectOut, status_code=201)
async def create_subject(
    data: SubjectCreate, user: User = Depends(require_teacher), repo=Depends(_repo)
):
    return await repo.add(Subject(user_id=user.id, **data.model_dump()))


@router.put("/{subject_id}", response_model=SubjectOut)
async def update_subject(
    subject_id: uuid.UUID,
    data: SubjectUpdate,
    user: User = Depends(require_teacher),
    repo=Depends(_repo),
):
    subject = await _get_or_404(repo, user, subject_id)
    for k, v in data.model_dump().items():
        setattr(subject, k, v)
    return await repo.save(subject)


@router.delete("/{subject_id}", status_code=204)
async def delete_subject(
    subject_id: uuid.UUID, user: User = Depends(require_teacher), repo=Depends(_repo)
):
    await repo.delete(await _get_or_404(repo, user, subject_id))
