from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.bot.scheduler import process_due_notifications
from app.bot.service import TelegramBotService
from app.models.notification import NotificationQueue
from app.models.user import User
from tests.conftest import make_subject, register


async def _task(client, h, deadline, **kw):
    s = await make_subject(client, h)
    body = {
        "subject_id": s["id"],
        "title": "Курсова",
        "task_type": "COURSEWORK",
        "deadline": deadline.isoformat(),
        "estimated_hours": 5,
    }
    body.update(kw)
    r = await client.post("/api/tasks", json=body, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


async def test_generate_link_and_bind(client, session):
    h = await register(client)
    r = await client.post("/api/telegram/generate-link", headers=h)
    assert r.status_code == 200
    token = r.json()["token"]
    assert token in r.json()["deep_link"] and r.json()["deep_link"].startswith("https://t.me/")

    svc = TelegramBotService(session)
    assert await svc.link_account("bad-token", 111) is False
    assert await svc.link_account(token, 111) is True
    assert await svc.link_account(token, 222) is False  # one-time token

    me = await client.get("/api/auth/me", headers=h)
    assert me.json()["telegram_linked"] is True


async def test_bot_commands_text(client, session):
    h = await register(client)
    await _task(client, h, datetime.now(timezone.utc) + timedelta(days=2))
    t2 = await _task(client, h, datetime.now(timezone.utc) + timedelta(days=5), title="Lab")
    await client.patch(f"/api/tasks/{t2['id']}/status", json={"status": "UNDER_REVIEW"}, headers=h)

    user = (await session.execute(select(User))).scalar_one()
    svc = TelegramBotService(session)
    deadlines = await svc.deadlines_text(user)
    assert "Курсова" in deadlines and "Lab" in deadlines
    status_text = await svc.status_text(user)
    assert "На перевірці: 1" in status_text and "правок: 0" in status_text
    assert "немає" in await svc.today_text(user)


async def test_scheduler_sends_due_and_marks_sent(client, session):
    h = await register(client)
    await _task(client, h, datetime.now(timezone.utc) + timedelta(hours=1))  # 2h trigger already due? no: trigger in the past is skipped
    user = (await session.execute(select(User))).scalar_one()
    user.telegram_chat_id = 42
    await session.commit()

    # make OVERDUE + TWO_HOURS notifications due now
    rows = (await session.execute(select(NotificationQueue))).scalars().all()
    for n in rows:
        n.trigger_time = datetime.now(timezone.utc) - timedelta(minutes=1)
    await session.commit()

    sent: list[tuple[int, str]] = []

    async def fake_send(chat_id: int, text: str):
        sent.append((chat_id, text))

    count = await process_due_notifications(session, fake_send)
    assert count == len(rows) and all(c == 42 for c, _ in sent)
    assert "Курсова" in sent[0][1]
    # second run: nothing left
    assert await process_due_notifications(session, fake_send) == 0


async def test_scheduler_retries_on_send_failure(client, session):
    h = await register(client)
    await _task(client, h, datetime.now(timezone.utc) + timedelta(hours=1))
    user = (await session.execute(select(User))).scalar_one()
    user.telegram_chat_id = 42
    for n in (await session.execute(select(NotificationQueue))).scalars():
        n.trigger_time = datetime.now(timezone.utc) - timedelta(minutes=1)
    await session.commit()

    async def failing(chat_id: int, text: str):
        raise RuntimeError("telegram down")

    assert await process_due_notifications(session, failing) == 0
    pending = (
        await session.execute(select(NotificationQueue).where(NotificationQueue.is_sent.is_(False)))
    ).scalars().all()
    assert pending  # still queued for retry
