import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get(self, user_id: uuid.UUID) -> User | None:
        return await self.session.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        res = await self.session.execute(select(User).where(User.email == email.lower()))
        return res.scalar_one_or_none()

    async def get_by_link_token(self, token: str) -> User | None:
        res = await self.session.execute(select(User).where(User.telegram_link_token == token))
        return res.scalar_one_or_none()

    async def get_by_chat_id(self, chat_id: int) -> User | None:
        res = await self.session.execute(select(User).where(User.telegram_chat_id == chat_id))
        return res.scalar_one_or_none()

    async def add(self, user: User) -> User:
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def save(self, user: User) -> User:
        await self.session.commit()
        await self.session.refresh(user)
        return user
