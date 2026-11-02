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
