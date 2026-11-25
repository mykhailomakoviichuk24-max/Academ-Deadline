import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.security import SecurityService
from app.models.user import User
from app.repositories.user_repository import UserRepository

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    if creds is None:
        raise unauthorized
    sub = SecurityService.decode_token(creds.credentials)
    if sub is None:
        raise unauthorized
    user = await UserRepository(session).get(uuid.UUID(sub))
    if user is None:
        raise unauthorized
    return user


async def require_teacher(user: User = Depends(get_current_user)) -> User:
    if not user.is_teacher:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Teacher role required")
    return user


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
