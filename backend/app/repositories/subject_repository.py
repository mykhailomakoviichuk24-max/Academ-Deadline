from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.subject import Subject


class SubjectRepository:
    """Every query is scoped by user_id (strict data isolation)."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(self, user_id: uuid.UUID) -> list[Subject]:
        res = await self.session.execute(
            select(Subject).where(Subject.user_id == user_id).order_by(Subject.name)
        )
        return list(res.scalars())

    async def get(self, user_id: uuid.UUID, subject_id: uuid.UUID) -> Subject | None:
        res = await self.session.execute(
            select(Subject).where(Subject.id == subject_id, Subject.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def add(self, subject: Subject) -> Subject:
        self.session.add(subject)
        await self.session.commit()
        await self.session.refresh(subject)
        return subject

    async def save(self, subject: Subject) -> Subject:
        await self.session.commit()
        await self.session.refresh(subject)
        return subject

    async def delete(self, subject: Subject) -> None:
        await self.session.delete(subject)
        await self.session.commit()
