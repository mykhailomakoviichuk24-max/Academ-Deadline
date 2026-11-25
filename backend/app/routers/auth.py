from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_user
from app.models.group import Group
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _service(session: AsyncSession = Depends(get_session)) -> AuthService:
    return AuthService(UserRepository(session))


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(data: RegisterRequest, svc: AuthService = Depends(_service)):
    return await svc.register(data)


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, svc: AuthService = Depends(_service)):
    return await svc.login(data)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshRequest, svc: AuthService = Depends(_service)):
    return await svc.refresh(data.refresh_token)


@router.get("/me", response_model=UserOut)
async def me(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    group_name = None
    if user.group_id:
        group_name = (
            await session.execute(select(Group.name).where(Group.id == user.group_id))
        ).scalar_one_or_none()
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        telegram_linked=user.telegram_chat_id is not None,
        role=user.role,
        group_name=group_name,
        created_at=user.created_at,
    )
