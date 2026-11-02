import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.models.enums import ReviewStatus
from app.repositories.task_repository import TaskRepository
from app.schemas import DayWorkload, WorkloadOut

# Hours-per-day thresholds
MEDIUM_THRESHOLD = 4.0
HIGH_THRESHOLD = 8.0


def day_risk(hours: float) -> str:
    if hours >= HIGH_THRESHOLD:
        return "HIGH"
    if hours >= MEDIUM_THRESHOLD:
        return "MEDIUM"
    return "LOW"


class WorkloadService:
    def __init__(self, tasks: TaskRepository):
        self.tasks = tasks

    async def calculate(self, user_id: uuid.UUID, range_: str = "week") -> WorkloadOut:
        days_count = {"day": 1, "week": 7, "month": 30}.get(range_, 7)
        start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=days_count)
        tasks = await self.tasks.list(user_id, from_date=start, to_date=end)
        tasks = [t for t in tasks if t.status != ReviewStatus.ACCEPTED]

        hours: dict[str, float] = defaultdict(float)
        counts: dict[str, int] = defaultdict(int)
        for t in tasks:
            key = t.deadline.date().isoformat()
            hours[key] += t.estimated_hours
            counts[key] += 1

        days = []
        for i in range(days_count):
            key = (start + timedelta(days=i)).date().isoformat()
            h = round(hours.get(key, 0.0), 2)
            days.append(
                DayWorkload(date=key, total_hours=h, tasks_count=counts.get(key, 0), risk=day_risk(h))
            )

        total_hours = round(sum(d.total_hours for d in days), 2)
        high_days = [d for d in days if d.risk == "HIGH"]
        # burnout: 2+ consecutive days of MEDIUM+ load, or any HIGH day
        consecutive = any(
            days[i].risk != "LOW" and days[i + 1].risk != "LOW" for i in range(len(days) - 1)
        )
        burnout = bool(high_days) or (consecutive and total_hours >= MEDIUM_THRESHOLD * 2)

        overall = "LOW"
        if high_days or total_hours / max(days_count, 1) >= HIGH_THRESHOLD * 0.75:
            overall = "HIGH"
        elif any(d.risk == "MEDIUM" for d in days):
            overall = "MEDIUM"

        message = {
            "HIGH": "Високе навантаження: перегляньте пріоритети та почніть роботи заздалегідь.",
            "MEDIUM": "Помірне навантаження: стежте за накладанням дедлайнів.",
            "LOW": "Навантаження низьке — можна планувати наперед.",
        }[overall]
        return WorkloadOut(
            range=range_,
            days=days,
            total_hours=total_hours,
            total_tasks=len(tasks),
            overall_risk=overall,
            burnout_warning=burnout,
            message=message,
        )
