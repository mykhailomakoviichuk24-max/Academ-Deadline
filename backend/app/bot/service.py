"""Telegram bot business logic (framework-independent, easy to test)."""
import logging
from html import escape
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import NotificationType, ReviewStatus
from app.models.subject import Subject
from app.models.task import Task
from app.models.user import User
from app.repositories.user_repository import UserRepository

log = logging.getLogger(__name__)

STATUS_LABELS = {
    ReviewStatus.TODO: "📝 До виконання",
    ReviewStatus.IN_PROGRESS: "🛠 В роботі",
    ReviewStatus.UNDER_REVIEW: "🔎 На перевірці",
    ReviewStatus.REQUIRES_CHANGES: "✏️ Потребує правок",
    ReviewStatus.ACCEPTED: "✅ Прийнято",
}

NOTIFICATION_TEXT = {
    NotificationType.THREE_DAYS_LEFT: "⏳ Залишилось 3 дні",
    NotificationType.ONE_DAY_LEFT: "⚠️ Залишилась 1 доба",
    NotificationType.TWO_HOURS_LEFT: "🔥 Залишилось 2 години",
    NotificationType.OVERDUE: "❌ Дедлайн прострочено",
}


class TelegramBotService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.users = UserRepository(session)

    # ---- linking ----
    async def link_account(self, token: str, chat_id: int) -> bool:
        user = await self.users.get_by_link_token(token)
        if user is None:
            return False
        user.telegram_chat_id = chat_id
        user.telegram_link_token = None  # one-time token
        await self.users.save(user)
        return True

    async def get_user(self, chat_id: int) -> User | None:
        return await self.users.get_by_chat_id(chat_id)

    # ---- queries ----
    async def _rows(self, user: User, start: datetime, end: datetime):
        q = (
            select(Task, Subject)
            .join(Subject, Subject.id == Task.subject_id)
            .where(
                Task.user_id == user.id,
                Task.deadline >= start,
                Task.deadline < end,
                Task.status != ReviewStatus.ACCEPTED,
            )
            .order_by(Task.deadline)
        )
        return [tuple(r) for r in (await self.session.execute(q)).all()]

    async def today_text(self, user: User) -> str:
        now = datetime.now(timezone.utc)
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        rows = await self._rows(user, start, start + timedelta(days=1))
        if not rows:
            return "Сьогодні дедлайнів немає 🎉"
        lines = ["📅 <b>Сьогодні:</b>"]
        for task, subject in rows:
            lines.append(
                f"• <b>{escape(task.title)}</b> ({escape(subject.name)}) — до {task.deadline:%H:%M} UTC\n"
                f"  {STATUS_LABELS[task.status]}"
            )
        return "\n".join(lines)

    async def deadlines_text(self, user: User) -> str:
        now = datetime.now(timezone.utc)
        rows = await self._rows(user, now, now + timedelta(days=7))
        if not rows:
            return "На найближчі 7 днів дедлайнів немає 🎉"
        groups: dict[str, list[str]] = {"🔴 Терміново (менше 24 год)": [], "🟠 Скоро (1–3 дні)": [], "🟢 Цього тижня": []}
        for task, subject in rows:
            delta = task.deadline - now
            line = f"• {escape(task.title)} ({escape(subject.name)}) — {task.deadline:%d.%m %H:%M}"
            if delta < timedelta(hours=24):
                groups["🔴 Терміново (менше 24 год)"].append(line)
            elif delta < timedelta(days=3):
                groups["🟠 Скоро (1–3 дні)"].append(line)
            else:
                groups["🟢 Цього тижня"].append(line)
        out = ["📌 <b>Дедлайни на 7 днів:</b>"]
        for title, lines in groups.items():
            if lines:
                out.append(f"\n<b>{title}</b>")
                out.extend(lines)
        return "\n".join(out)

    async def status_text(self, user: User) -> str:
        res = await self.session.execute(
            select(Task.status).where(
                Task.user_id == user.id,
                Task.status.in_([ReviewStatus.UNDER_REVIEW, ReviewStatus.REQUIRES_CHANGES]),
            )
        )
        statuses = list(res.scalars())
        review = statuses.count(ReviewStatus.UNDER_REVIEW)
        changes = statuses.count(ReviewStatus.REQUIRES_CHANGES)
        return (
            f"📊 <b>Статус робіт</b>\n🔎 На перевірці: {review}\n✏️ Потребують правок: {changes}"
        )

    # ---- notifications ----
    @staticmethod
    def format_notification(ntype: NotificationType, task: Task, subject: Subject) -> str:
        return (
            f"{NOTIFICATION_TEXT[ntype]}\n"
            f"<b>{escape(task.title)}</b> ({escape(subject.name)})\n"
            f"Дедлайн: {task.deadline:%d.%m.%Y %H:%M} UTC"
        )
