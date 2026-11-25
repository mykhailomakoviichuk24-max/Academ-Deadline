import secrets

from fastapi import HTTPException, status
from sqlalchemy import select

from app.core.config import settings
from app.models.enums import UserRole
from app.models.group import Group

from app.core.security import SecurityService
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas import LoginRequest, RegisterRequest, TokenResponse


class AuthService:
    def __init__(self, users: UserRepository):
        self.users = users

    @staticmethod
    def _tokens(user: User) -> TokenResponse:
        uid = str(user.id)
        return TokenResponse(
            access_token=SecurityService.create_access_token(uid),
            refresh_token=SecurityService.create_refresh_token(uid),
        )

    async def register(self, data: RegisterRequest) -> TokenResponse:
        if await self.users.get_by_email(data.email):
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
        role = UserRole.TEACHER if data.role == "TEACHER" else UserRole.STUDENT
        if role == UserRole.TEACHER:
            expected = settings.teacher_access_code
            given = data.teacher_code or ""
            if not expected or not secrets.compare_digest(given, expected):
                raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid teacher access code")
        group_id = None
        if data.group_code and role == UserRole.STUDENT:
            res = await self.users.session.execute(
                select(Group).where(Group.invite_code == data.group_code.strip().upper())
            )
            group = res.scalar_one_or_none()
            if group is None:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
            group_id = group.id
        user = User(
            email=data.email.lower(),
            password_hash=SecurityService.hash_password(data.password),
            full_name=data.full_name,
            role=role.value,
            group_id=group_id,
        )
        await self.users.add(user)
        return self._tokens(user)

    async def login(self, data: LoginRequest) -> TokenResponse:
        user = await self.users.get_by_email(data.email)
        if user is None or not SecurityService.verify_password(data.password, user.password_hash):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
        return self._tokens(user)

    async def refresh(self, refresh_token: str) -> TokenResponse:
        sub = SecurityService.decode_token(refresh_token, expected_type="refresh")
        if sub is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
        import uuid

        user = await self.users.get(uuid.UUID(sub))
        if user is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
        return self._tokens(user)
