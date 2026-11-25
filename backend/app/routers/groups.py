from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.group import Group
from app.models.user import User
from app.schemas import JoinGroupOut, JoinGroupRequest

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.post("/join", response_model=JoinGroupOut)
async def join_group(
    data: JoinGroupRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """A student joins a teacher's group by its invite code."""
    if user.is_teacher:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Teachers cannot join groups")
    res = await session.execute(select(Group).where(Group.invite_code == data.code.strip().upper()))
    group = res.scalar_one_or_none()
    if group is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
    user.group_id = group.id
    await session.commit()
    return JoinGroupOut(group_id=group.id, group_name=group.name)
