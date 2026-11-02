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
    r = await client.post(
        "/api/subjects",
        json={"name": name, "teacher_name": "Dr. Smith", "teacher_contact": "smith@uni.edu"},
        headers=headers,
    )
    assert r.status_code == 201, r.text
    return r.json()
