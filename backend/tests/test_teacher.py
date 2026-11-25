"""Teacher (administrator) role: groups, issued tasks, review, access control."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.config import settings
from app.models.notification import NotificationQueue
from tests.conftest import register

CODE = "t-secret"


async def register_teacher(client, monkeypatch, email="teacher@x.com"):
    monkeypatch.setattr(settings, "teacher_access_code", CODE)
    r = await client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "secret123",
            "full_name": "Dr. Teacher",
            "role": "TEACHER",
            "teacher_code": CODE,
        },
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def make_group(client, th, name="IPZ-31"):
    r = await client.post("/api/teacher/groups", json={"name": name}, headers=th)
    assert r.status_code == 201, r.text
    return r.json()


async def student_in_group(client, code, email):
    r = await client.post(
        "/api/auth/register",
        json={"email": email, "password": "secret123", "full_name": email.split("@")[0],
              "group_code": code},
    )
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def ensure_subject(client, th, name):
    have = (await client.get("/api/subjects", headers=th)).json()
    if not any(s["name"] == name for s in have):
        r = await client.post(
            "/api/subjects", json={"name": name, "resources_url": "https://example.com/db"}, headers=th
        )
        assert r.status_code == 201, r.text


async def assign(client, th, group_id, **kw):
    if "subject_name" not in kw:
        await ensure_subject(client, th, "Databases")
    else:
        await ensure_subject(client, th, kw["subject_name"])
    body = {
        "group_id": group_id,
        "subject_name": "Databases",
        "title": "Lab 1",
        "task_type": "LABORATORY",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
        "estimated_hours": 3,
        "priority": "HIGH",
    }
    body.update(kw)
    return await client.post("/api/teacher/assignments", json=body, headers=th)


async def test_teacher_registration_requires_code(client, monkeypatch):
    payload = {"email": "t@x.com", "password": "secret123", "full_name": "T", "role": "TEACHER"}
    # teacher registration disabled when no code is configured
    monkeypatch.setattr(settings, "teacher_access_code", "")
    assert (await client.post("/api/auth/register", json=payload)).status_code == 403
    monkeypatch.setattr(settings, "teacher_access_code", CODE)
    assert (await client.post("/api/auth/register", json=payload)).status_code == 403
    bad = {**payload, "teacher_code": "wrong"}
    assert (await client.post("/api/auth/register", json=bad)).status_code == 403
    ok = await client.post("/api/auth/register", json={**payload, "teacher_code": CODE})
    assert ok.status_code == 201
    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {ok.json()['access_token']}"}
    )
    assert me.json()["role"] == "TEACHER"


async def test_student_cannot_use_teacher_api(client):
    sh = await register(client)
    assert (await client.get("/api/teacher/groups", headers=sh)).status_code == 403
    assert (await client.post("/api/teacher/groups", json={"name": "x"}, headers=sh)).status_code == 403
    assert (await client.get("/api/teacher/groups")).status_code == 401
    assert (await client.get("/api/auth/me", headers=sh)).json()["role"] == "STUDENT"


async def test_group_create_and_student_join(client, monkeypatch):
    th = await register_teacher(client, monkeypatch)
    g = await make_group(client, th)
    assert len(g["invite_code"]) == 6

    s1 = await student_in_group(client, g["invite_code"].lower(), "anna@x.com")
    assert (await client.get("/api/auth/me", headers=s1)).json()["group_name"] == "IPZ-31"

    s2 = await register(client, "ivan@x.com")
    assert (await client.post("/api/groups/join", json={"code": "NOPE00"}, headers=s2)).status_code == 404
    joined = await client.post("/api/groups/join", json={"code": g["invite_code"]}, headers=s2)
    assert joined.status_code == 200 and joined.json()["group_name"] == "IPZ-31"
    # a teacher cannot join a group
    assert (await client.post("/api/groups/join", json={"code": g["invite_code"]}, headers=th)).status_code == 403

    groups = (await client.get("/api/teacher/groups", headers=th)).json()
    assert groups[0]["students_count"] == 2
    bad = await client.post(
        "/api/auth/register",
        json={"email": "z@x.com", "password": "secret123", "full_name": "Z", "group_code": "NOPE00"},
    )
    assert bad.status_code == 404


async def test_assignment_creates_tasks_with_notifications(client, session, monkeypatch):
    th = await register_teacher(client, monkeypatch)
    g = await make_group(client, th)
    s1 = await student_in_group(client, g["invite_code"], "anna@x.com")
    s2 = await student_in_group(client, g["invite_code"], "ivan@x.com")

    r = await assign(client, th, g["id"])
    assert r.status_code == 201 and r.json()["created"] == 2

    for h in (s1, s2):
        tasks = (await client.get("/api/tasks", headers=h)).json()
        assert len(tasks) == 1 and tasks[0]["assigned_by"] is not None
        subjects = (await client.get("/api/subjects", headers=h)).json()
        assert subjects[0]["name"] == "Databases" and subjects[0]["teacher_name"] == "Dr. Teacher"
    # 3 future triggers + OVERDUE per student
    count = (await session.execute(select(func.count()).select_from(NotificationQueue))).scalar_one()
    assert count == 2 * 4

    # a second assignment reuses the student's existing subject
    await assign(client, th, g["id"], title="Lab 2")
    assert len((await client.get("/api/subjects", headers=s1)).json()) == 1

    # only selected students
    only = await client.post(
        "/api/teacher/assignments",
        json={"group_id": g["id"], "subject_name": "Databases", "title": "Extra",
              "task_type": "PRACTICAL",
              "deadline": (datetime.now(timezone.utc) + timedelta(days=9)).isoformat(),
              "student_ids": [(await client.get("/api/teacher/groups/%s/students" % g["id"], headers=th)).json()[0]["id"]]},
        headers=th,
    )
    assert only.json()["created"] == 1


async def test_student_restrictions_on_assigned_task(client, monkeypatch):
    th = await register_teacher(client, monkeypatch)
    g = await make_group(client, th)
    sh = await student_in_group(client, g["invite_code"], "anna@x.com")
    await assign(client, th, g["id"])
    t = (await client.get("/api/tasks", headers=sh)).json()[0]

    put = {k: t[k] for k in ("subject_id", "title", "task_type", "deadline", "estimated_hours", "priority")}
    assert (await client.put(f"/api/tasks/{t['id']}", json=put, headers=sh)).status_code == 403
    assert (await client.delete(f"/api/tasks/{t['id']}", headers=sh)).status_code == 403
    for forbidden in ("ACCEPTED", "REQUIRES_CHANGES"):
        r = await client.patch(f"/api/tasks/{t['id']}/status", json={"status": forbidden}, headers=sh)
        assert r.status_code == 403
    for allowed in ("IN_PROGRESS", "UNDER_REVIEW"):
        r = await client.patch(f"/api/tasks/{t['id']}/status", json={"status": allowed}, headers=sh)
        assert r.status_code == 200
    r = await client.patch(f"/api/tasks/{t['id']}/progress", json={"progress": 60}, headers=sh)
    assert r.status_code == 200 and r.json()["progress"] == 60


async def test_teacher_review_flow(client, monkeypatch):
    th = await register_teacher(client, monkeypatch)
    g = await make_group(client, th)
    sh = await student_in_group(client, g["invite_code"], "anna@x.com")
    await assign(client, th, g["id"])
    t = (await client.get("/api/tasks", headers=sh)).json()[0]
    await client.patch(f"/api/tasks/{t['id']}/status", json={"status": "UNDER_REVIEW"}, headers=sh)

    queue = (await client.get("/api/teacher/tasks?status=UNDER_REVIEW", headers=th)).json()
    assert len(queue) == 1 and queue[0]["student_name"] == "anna" and queue[0]["subject_name"] == "Databases"

    back = await client.patch(
        f"/api/teacher/tasks/{t['id']}/review",
        json={"status": "REQUIRES_CHANGES", "review_notes": "Fix the ER diagram"},
        headers=th,
    )
    assert back.status_code == 200 and back.json()["status"] == "REQUIRES_CHANGES"
    mine = (await client.get("/api/tasks", headers=sh)).json()[0]
    assert mine["status"] == "REQUIRES_CHANGES" and mine["review_notes"] == "Fix the ER diagram"

    # student reworks and resubmits, teacher accepts
    await client.patch(f"/api/tasks/{t['id']}/status", json={"status": "UNDER_REVIEW"}, headers=sh)
    ok = await client.patch(
        f"/api/teacher/tasks/{t['id']}/review", json={"status": "ACCEPTED"}, headers=th
    )
    assert ok.json()["status"] == "ACCEPTED" and ok.json()["progress"] == 100
    # after acceptance the student cannot reopen it
    r = await client.patch(f"/api/tasks/{t['id']}/status", json={"status": "IN_PROGRESS"}, headers=sh)
    assert r.status_code == 403
    # invalid review status is rejected by validation
    bad = await client.patch(
        f"/api/teacher/tasks/{t['id']}/review", json={"status": "TODO"}, headers=th
    )
    assert bad.status_code == 422


async def test_teacher_isolation(client, monkeypatch):
    t1 = await register_teacher(client, monkeypatch, "t1@x.com")
    t2 = await register_teacher(client, monkeypatch, "t2@x.com")
    g = await make_group(client, t1)
    sh = await student_in_group(client, g["invite_code"], "anna@x.com")
    await assign(client, t1, g["id"])
    task_id = (await client.get("/api/tasks", headers=sh)).json()[0]["id"]

    assert (await client.get(f"/api/teacher/groups/{g['id']}/students", headers=t2)).status_code == 404
    assert (await assign(client, t2, g["id"])).status_code == 404
    review = await client.patch(
        f"/api/teacher/tasks/{task_id}/review", json={"status": "ACCEPTED"}, headers=t2
    )
    assert review.status_code == 404
    assert (await client.delete(f"/api/teacher/tasks/{task_id}", headers=t2)).status_code == 404
    assert (await client.get("/api/teacher/tasks", headers=t2)).json() == []
    assert (await client.get("/api/teacher/groups", headers=t2)).json() == []


async def test_students_stats_cancel_and_remove(client, monkeypatch):
    th = await register_teacher(client, monkeypatch)
    g = await make_group(client, th)
    sh = await student_in_group(client, g["invite_code"], "anna@x.com")
    await assign(client, th, g["id"])
    await assign(client, th, g["id"], title="Old lab",
                 deadline=(datetime.now(timezone.utc) - timedelta(days=1)).isoformat())
    tasks = (await client.get("/api/tasks", headers=sh)).json()
    new = next(t for t in tasks if t["title"] == "Lab 1")
    await client.patch(f"/api/tasks/{new['id']}/status", json={"status": "UNDER_REVIEW"}, headers=sh)

    stats = (await client.get(f"/api/teacher/groups/{g['id']}/students", headers=th)).json()[0]
    assert stats["total_tasks"] == 2 and stats["under_review"] == 1 and stats["overdue"] == 1
    assert stats["accepted"] == 0

    assert (await client.delete(f"/api/teacher/tasks/{new['id']}", headers=th)).status_code == 204
    assert len((await client.get("/api/tasks", headers=sh)).json()) == 1

    sid = stats["id"]
    assert (await client.delete(f"/api/teacher/groups/{g['id']}/students/{sid}", headers=th)).status_code == 204
    assert (await client.get(f"/api/teacher/groups/{g['id']}/students", headers=th)).json() == []
    assert (await client.get("/api/auth/me", headers=sh)).json()["group_name"] is None


async def test_students_cannot_manage_subjects_or_accept_own_tasks(client, monkeypatch):
    th = await register_teacher(client, monkeypatch)
    g = await make_group(client, th)
    sh = await student_in_group(client, g["invite_code"], "anna@x.com")

    # no subjects yet and a student cannot create one
    assert (await client.get("/api/subjects", headers=sh)).json() == []
    assert (await client.post("/api/subjects", json={"name": "Mine"}, headers=sh)).status_code == 403

    # a subject arrives with the first assignment (with the teacher's materials link)
    await assign(client, th, g["id"])
    subj = (await client.get("/api/subjects", headers=sh)).json()[0]
    assert subj["name"] == "Databases" and subj["resources_url"] == "https://example.com/db"

    # a self-created task can reach UNDER_REVIEW but never ACCEPTED / REQUIRES_CHANGES
    own = await client.post(
        "/api/tasks",
        json={"subject_id": subj["id"], "title": "My own", "task_type": "PRACTICAL",
              "deadline": (datetime.now(timezone.utc) + timedelta(days=4)).isoformat()},
        headers=sh,
    )
    assert own.status_code == 201
    tid = own.json()["id"]
    for forbidden in ("ACCEPTED", "REQUIRES_CHANGES"):
        r = await client.patch(f"/api/tasks/{tid}/status", json={"status": forbidden}, headers=sh)
        assert r.status_code == 403
        put = await client.put(
            f"/api/tasks/{tid}",
            json={"subject_id": subj["id"], "title": "My own", "task_type": "PRACTICAL",
                  "deadline": own.json()["deadline"], "status": forbidden},
            headers=sh,
        )
        assert put.status_code == 403
    ok = await client.patch(f"/api/tasks/{tid}/status", json={"status": "UNDER_REVIEW"}, headers=sh)
    assert ok.status_code == 200


async def test_assignment_requires_subject_from_teacher_catalog(client, monkeypatch):
    th = await register_teacher(client, monkeypatch)
    g = await make_group(client, th)
    await student_in_group(client, g["invite_code"], "anna@x.com")
    body = {
        "group_id": g["id"], "subject_name": "Unknown", "title": "Lab", "task_type": "LABORATORY",
        "deadline": (datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
    }
    r = await client.post("/api/teacher/assignments", json=body, headers=th)
    assert r.status_code == 404


async def test_teacher_analytics(client, session, monkeypatch):
    from tests.conftest import teacher_set_status

    th = await register_teacher(client, monkeypatch)
    g = await make_group(client, th)
    s1 = await student_in_group(client, g["invite_code"], "anna@x.com")
    await student_in_group(client, g["invite_code"], "ivan@x.com")
    soon = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    await assign(client, th, g["id"], title="Lab", deadline=soon, estimated_hours=4)
    await assign(client, th, g["id"], title="Old", task_type="PRACTICAL", deadline=past)

    # one student hands in a lab, the teacher accepts it
    lab = next(t for t in (await client.get("/api/tasks", headers=s1)).json() if t["title"] == "Lab")
    await client.patch(f"/api/tasks/{lab['id']}/status", json={"status": "UNDER_REVIEW"}, headers=s1)
    data = (await client.get(f"/api/teacher/analytics?group_id={g['id']}", headers=th)).json()
    assert data["students_count"] == 2 and data["tasks_total"] == 4
    assert data["review_queue"] == 1 and data["overdue"] == 2
    await teacher_set_status(session, lab["id"], "ACCEPTED")

    data = (await client.get("/api/teacher/analytics", headers=th)).json()
    assert data["by_status"]["ACCEPTED"] == 1 and data["review_queue"] == 0
    assert data["completion_percent"] == 25.0
    types = {t["key"]: t for t in data["by_type"]}
    assert types["LABORATORY"]["total"] == 2 and types["LABORATORY"]["accepted"] == 1
    assert types["PRACTICAL"]["total"] == 2
    assert data["by_subject"][0]["subject"] == "Databases" and data["by_subject"][0]["overdue"] == 2
    assert len(data["load"]) == 14
    # 4 h by 1 student's remaining lab / 2 students = 2 h per student -> LOW
    peak = data["busiest_day"]
    assert peak["hours"] == 4 and peak["hours_per_student"] == 2.0 and peak["risk"] == "LOW"
    # students with overdue work come first
    assert data["students"][0]["overdue"] >= data["students"][1]["overdue"]

    assert (await client.get("/api/teacher/analytics?days=0", headers=th)).status_code == 422
    other = await register_teacher(client, monkeypatch, "t2@x.com")
    assert (await client.get(f"/api/teacher/analytics?group_id={g['id']}", headers=other)).status_code == 404
    empty = (await client.get("/api/teacher/analytics", headers=other)).json()
    assert empty["students_count"] == 0 and empty["tasks_total"] == 0 and empty["busiest_day"] is None
