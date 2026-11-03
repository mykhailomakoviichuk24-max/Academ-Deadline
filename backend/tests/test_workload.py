from datetime import datetime, timedelta, timezone

from app.services.workload_service import day_risk
from tests.conftest import make_subject, register


def test_day_risk_thresholds():
    assert day_risk(1) == "LOW"
    assert day_risk(4) == "MEDIUM"
    assert day_risk(8) == "HIGH"


async def test_workload_week(client):
    h = await register(client)
    s = await make_subject(client, h)
    day = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=12, minute=0)
    for i, hours in enumerate((5, 4)):
        await client.post(
            "/api/tasks",
            json={
                "subject_id": s["id"],
                "title": f"T{i}",
                "task_type": "LABORATORY",
                "deadline": day.isoformat(),
                "estimated_hours": hours,
            },
            headers=h,
        )
    r = await client.get("/api/analytics/workload?range=week", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert len(data["days"]) == 7
    assert data["total_hours"] == 9
    assert data["total_tasks"] == 2
    busy = next(d for d in data["days"] if d["tasks_count"] == 2)
    assert busy["risk"] == "HIGH"
    assert data["overall_risk"] == "HIGH" and data["burnout_warning"] is True


async def test_workload_ignores_accepted_and_empty(client):
    h = await register(client)
    r = await client.get("/api/analytics/workload", headers=h)
    assert r.json()["overall_risk"] == "LOW" and r.json()["burnout_warning"] is False
    assert (await client.get("/api/analytics/workload?range=year", headers=h)).status_code == 422


async def test_workload_extended_analytics(client):
    h = await register(client)
    s = await make_subject(client, h, "Databases")
    now = datetime.now(timezone.utc)

    async def mk(title, ttype, deadline, hours, **kw):
        r = await client.post(
            "/api/tasks",
            json={
                "subject_id": s["id"],
                "title": title,
                "task_type": ttype,
                "deadline": deadline.isoformat(),
                "estimated_hours": hours,
                **kw,
            },
            headers=h,
        )
        assert r.status_code == 201, r.text
        return r.json()

    await mk("Coursework", "COURSEWORK", now + timedelta(days=3), 10, progress=40)
    await mk("Lab", "LABORATORY", now + timedelta(days=2), 2)
    await mk("Late lab", "LABORATORY", now - timedelta(days=1), 2)
    done = await mk("Done lab", "LABORATORY", now + timedelta(days=1), 2)
    await client.patch(f"/api/tasks/{done['id']}/status", json={"status": "ACCEPTED"}, headers=h)

    data = (await client.get("/api/analytics/workload?range=week", headers=h)).json()
    assert data["avg_hours_per_day"] == round(data["total_hours"] / 7, 2)
    assert data["busiest_day"]["total_hours"] == 10
    assert data["free_days"] <= 7
    assert [t["title"] for t in data["overdue"]] == ["Late lab"]
    assert data["overdue"][0]["hours_left"] < 0
    assert [t["title"] for t in data["upcoming"]][:2] == ["Lab", "Coursework"]
    assert len(data["coursework"]) == 1 and data["coursework"][0]["progress"] == 40
    assert data["coursework_avg_progress"] == 40.0

    comp = data["completion"]
    assert comp["total_tasks"] == 4 and comp["accepted_tasks"] == 1
    assert comp["completion_percent"] == 25.0
    assert comp["by_status"]["ACCEPTED"] == 1 and comp["by_status"]["TODO"] == 3
    assert comp["hours_total"] == 16
    # 10*0.4 + 2*0 + 2*0 + 2*1 = 6 hours done
    assert comp["hours_done"] == 6 and comp["progress_percent"] == 37.5

    assert data["by_subject"][0]["label"] == "Databases" and data["by_subject"][0]["hours"] == 12
    assert {i["key"] for i in data["by_type"]} == {"COURSEWORK", "LABORATORY"}
