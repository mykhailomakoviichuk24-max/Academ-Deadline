from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.notification import NotificationQueue
from tests.conftest import make_subject, register


def _payload(subject_id, deadline, **kw):
    base = {
        "subject_id": subject_id,
        "title": "Lab 1",
        "task_type": "LABORATORY",
        "deadline": deadline.isoformat(),
        "estimated_hours": 3,
        "priority": "HIGH",
    }
    base.update(kw)
    return base


async def test_subject_crud_and_isolation(client):
    h1 = await register(client, "u1@x.com")
    h2 = await register(client, "u2@x.com")
    s = await make_subject(client, h1)
    assert len((await client.get("/api/subjects", headers=h1)).json()) == 1
    assert (await client.get("/api/subjects", headers=h2)).json() == []

    upd = await client.put(
        f"/api/subjects/{s['id']}", json={"name": "Math", "teacher_name": "T"}, headers=h1
    )
    assert upd.json()["name"] == "Math"
    assert (
        await client.put(f"/api/subjects/{s['id']}", json={"name": "Hack"}, headers=h2)
    ).status_code == 404
    assert (await client.delete(f"/api/subjects/{s['id']}", headers=h2)).status_code == 404
    assert (await client.delete(f"/api/subjects/{s['id']}", headers=h1)).status_code == 204


async def test_create_task_schedules_notifications(client, session):
    h = await register(client)
    s = await make_subject(client, h)
    deadline = datetime.now(timezone.utc) + timedelta(days=5)
    r = await client.post("/api/tasks", json=_payload(s["id"], deadline), headers=h)
    assert r.status_code == 201
    assert r.json()["status"] == "TODO"
    rows = (await session.execute(select(NotificationQueue))).scalars().all()
    assert {n.type.value for n in rows} == {
        "THREE_DAYS_LEFT",
        "ONE_DAY_LEFT",
        "TWO_HOURS_LEFT",
        "OVERDUE",
    }


async def test_past_triggers_are_skipped(client, session):
    h = await register(client)
    s = await make_subject(client, h)
    deadline = datetime.now(timezone.utc) + timedelta(hours=5)
    await client.post("/api/tasks", json=_payload(s["id"], deadline), headers=h)
    rows = (await session.execute(select(NotificationQueue))).scalars().all()
    assert {n.type.value for n in rows} == {"TWO_HOURS_LEFT", "OVERDUE"}


async def test_status_accepted_skips_and_deadline_regenerates(client, session):
    h = await register(client)
    s = await make_subject(client, h)
    deadline = datetime.now(timezone.utc) + timedelta(days=5)
    t = (await client.post("/api/tasks", json=_payload(s["id"], deadline), headers=h)).json()

    new_deadline = datetime.now(timezone.utc) + timedelta(days=10)
    r = await client.patch(
        f"/api/tasks/{t['id']}/status",
        json={"status": "REQUIRES_CHANGES", "review_notes": "Fix part 2", "deadline": new_deadline.isoformat()},
        headers=h,
    )
    assert r.status_code == 200
    assert r.json()["review_notes"] == "Fix part 2"
    session.expire_all()
    rows = (await session.execute(select(NotificationQueue))).scalars().all()
    assert len(rows) == 4 and all(not n.is_sent for n in rows)
    assert min(n.trigger_time for n in rows) > deadline

    r = await client.patch(f"/api/tasks/{t['id']}/status", json={"status": "ACCEPTED"}, headers=h)
    assert r.json()["status"] == "ACCEPTED"
    session.expire_all()
    rows = (await session.execute(select(NotificationQueue))).scalars().all()
    assert rows and all(n.is_sent for n in rows)  # skipped


async def test_filters_update_delete_cascade(client, session):
    h = await register(client)
    s1 = await make_subject(client, h, "A")
    s2 = await make_subject(client, h, "B")
    d = datetime.now(timezone.utc) + timedelta(days=3)
    t1 = (await client.post("/api/tasks", json=_payload(s1["id"], d), headers=h)).json()
    await client.post("/api/tasks", json=_payload(s2["id"], d, title="Lab 2"), headers=h)

    assert len((await client.get("/api/tasks", headers=h)).json()) == 2
    assert len((await client.get(f"/api/tasks?subject_id={s1['id']}", headers=h)).json()) == 1
    assert len((await client.get("/api/tasks?status=ACCEPTED", headers=h)).json()) == 0

    put = await client.put(
        f"/api/tasks/{t1['id']}",
        json=_payload(s1["id"], d, title="Renamed", task_type="COURSEWORK"),
        headers=h,
    )
    assert put.json()["title"] == "Renamed"

    assert (await client.delete(f"/api/tasks/{t1['id']}", headers=h)).status_code == 204
    rows = (await session.execute(select(NotificationQueue).where(NotificationQueue.task_id == t1["id"]))).scalars().all()
    assert rows == []


async def test_task_isolation_and_foreign_subject(client):
    h1 = await register(client, "u1@x.com")
    h2 = await register(client, "u2@x.com")
    s1 = await make_subject(client, h1)
    d = datetime.now(timezone.utc) + timedelta(days=3)
    t = (await client.post("/api/tasks", json=_payload(s1["id"], d), headers=h1)).json()
    assert (await client.get("/api/tasks", headers=h2)).json() == []
    assert (
        await client.patch(f"/api/tasks/{t['id']}/status", json={"status": "ACCEPTED"}, headers=h2)
    ).status_code == 404
    assert (await client.post("/api/tasks", json=_payload(s1["id"], d), headers=h2)).status_code == 404


async def test_progress_update_and_accepted_forces_100(client):
    h = await register(client)
    other = await register(client, "other@x.com")
    s = await make_subject(client, h)
    d = datetime.now(timezone.utc) + timedelta(days=10)
    r = await client.post(
        "/api/tasks",
        json=_payload(s["id"], d, task_type="COURSEWORK", progress=30),
        headers=h,
    )
    assert r.status_code == 201 and r.json()["progress"] == 30
    tid = r.json()["id"]

    ok = await client.patch(f"/api/tasks/{tid}/progress", json={"progress": 60}, headers=h)
    assert ok.status_code == 200 and ok.json()["progress"] == 60
    assert (
        await client.patch(f"/api/tasks/{tid}/progress", json={"progress": 101}, headers=h)
    ).status_code == 422
    assert (
        await client.patch(f"/api/tasks/{tid}/progress", json={"progress": 10}, headers=other)
    ).status_code == 404

    done = await client.patch(f"/api/tasks/{tid}/status", json={"status": "ACCEPTED"}, headers=h)
    assert done.json()["progress"] == 100
    bad = await client.post(
        "/api/tasks", json=_payload(s["id"], d, progress=150), headers=h
    )
    assert bad.status_code == 422
