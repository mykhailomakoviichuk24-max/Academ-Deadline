import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
os.environ["SECRET_KEY"] = "test-secret"

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(autouse=True)
async def _db():
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def session():
    async with SessionLocal() as s:
        yield s


async def register(client: AsyncClient, email="student@example.com", password="secret123"):
    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "full_name": "Test Student"},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def make_subject(client: AsyncClient, headers, name="Algorithms"):
    """Give a student a subject. Students cannot create subjects through the API
    (only teachers can), so the row is inserted directly, as an assignment would do."""
    import uuid

    from app.models.subject import Subject

    me = (await client.get("/api/auth/me", headers=headers)).json()
    async with SessionLocal() as s:
        subject = Subject(
            user_id=uuid.UUID(me["id"]),
            name=name,
            teacher_name="Dr. Smith",
            teacher_contact="smith@uni.edu",
        )
        s.add(subject)
        await s.commit()
        await s.refresh(subject)
        return {"id": str(subject.id), "name": subject.name}


async def teacher_set_status(session, task_id, status, review_notes=None, deadline=None):
    """What a teacher's review does: set a reviewer-only status on a student's task."""
    import uuid

    from app.models.task import Task
    from app.repositories.subject_repository import SubjectRepository
    from app.repositories.task_repository import TaskRepository
    from app.schemas import TaskStatusUpdate
    from app.services.task_service import TaskService

    task = await session.get(Task, uuid.UUID(str(task_id)))
    svc = TaskService(TaskRepository(session), SubjectRepository(session))
    return await svc.update_status(
        task.user_id,
        task.id,
        TaskStatusUpdate(status=status, review_notes=review_notes, deadline=deadline),
        by_teacher=True,
    )
