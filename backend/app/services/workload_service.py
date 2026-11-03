import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from app.models.enums import ReviewStatus, TaskType
from app.models.task import Task
from app.repositories.subject_repository import SubjectRepository
from app.repositories.task_repository import TaskRepository
from app.schemas import (
    BreakdownItem,
    CompletionStats,
    DayWorkload,
    TaskBrief,
    WorkloadOut,
)

# Hours-per-day thresholds
MEDIUM_THRESHOLD = 4.0
HIGH_THRESHOLD = 8.0

NO_SUBJECT = "Без предмета"
LIST_LIMIT = 10


def day_risk(hours: float) -> str:
    if hours >= HIGH_THRESHOLD:
        return "HIGH"
    if hours >= MEDIUM_THRESHOLD:
        return "MEDIUM"
    return "LOW"


class WorkloadService:
    def __init__(self, tasks: TaskRepository, subjects: SubjectRepository | None = None):
        self.tasks = tasks
        self.subjects = subjects

    # ---- helpers ----
    @staticmethod
    def _effective_progress(task: Task) -> int:
        return 100 if task.status == ReviewStatus.ACCEPTED else (task.progress or 0)

    def _brief(self, task: Task, subject_names: dict[uuid.UUID, str], now: datetime) -> TaskBrief:
        return TaskBrief(
            id=task.id,
            title=task.title,
            subject=subject_names.get(task.subject_id, NO_SUBJECT),
            task_type=task.task_type,
            priority=task.priority,
            status=task.status,
            deadline=task.deadline,
            estimated_hours=task.estimated_hours,
            progress=self._effective_progress(task),
            hours_left=round((task.deadline - now).total_seconds() / 3600, 1),
        )

    @staticmethod
    def _breakdown(
        tasks: list[Task], key_fn, label_fn=lambda k: k
    ) -> list[BreakdownItem]:
        hours: dict[str, float] = defaultdict(float)
        counts: dict[str, int] = defaultdict(int)
        for t in tasks:
            k = key_fn(t)
            hours[k] += t.estimated_hours
            counts[k] += 1
        items = [
            BreakdownItem(key=k, label=label_fn(k), hours=round(hours[k], 2), tasks=counts[k])
            for k in hours
        ]
        return sorted(items, key=lambda i: (-i.hours, i.label))

    # ---- main calculation ----
    async def calculate(self, user_id: uuid.UUID, range_: str = "week") -> WorkloadOut:
        days_count = {"day": 1, "week": 7, "month": 30}.get(range_, 7)
        now = datetime.now(timezone.utc)
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=days_count)

        all_tasks = await self.tasks.list(user_id)
        subject_names: dict[uuid.UUID, str] = {}
        if self.subjects is not None:
            subject_names = {s.id: s.name for s in await self.subjects.list(user_id)}

        tasks = [
            t
            for t in all_tasks
            if t.status != ReviewStatus.ACCEPTED and start <= t.deadline <= end
        ]

        hours: dict[str, float] = defaultdict(float)
        counts: dict[str, int] = defaultdict(int)
        titles: dict[str, list[str]] = defaultdict(list)
        for t in tasks:
            key = t.deadline.date().isoformat()
            hours[key] += t.estimated_hours
            counts[key] += 1
            titles[key].append(t.title)

        days = []
        for i in range(days_count):
            key = (start + timedelta(days=i)).date().isoformat()
            h = round(hours.get(key, 0.0), 2)
            days.append(
                DayWorkload(
                    date=key,
                    total_hours=h,
                    tasks_count=counts.get(key, 0),
                    risk=day_risk(h),
                    titles=titles.get(key, []),
                )
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

        # ---- extended analytics ----
        busiest = max(days, key=lambda d: d.total_hours)
        busiest_day = busiest if busiest.total_hours > 0 else None

        active = [t for t in all_tasks if t.status != ReviewStatus.ACCEPTED]
        overdue = [t for t in active if t.deadline < now]
        upcoming = [t for t in active if t.deadline >= now][:5]

        hours_total = round(sum(t.estimated_hours for t in all_tasks), 2)
        hours_done = round(
            sum(t.estimated_hours * self._effective_progress(t) / 100 for t in all_tasks), 2
        )
        accepted = [t for t in all_tasks if t.status == ReviewStatus.ACCEPTED]
        by_status = {s.value: 0 for s in ReviewStatus}
        for t in all_tasks:
            by_status[t.status.value] += 1
        completion = CompletionStats(
            total_tasks=len(all_tasks),
            accepted_tasks=len(accepted),
            completion_percent=round(100 * len(accepted) / len(all_tasks), 1) if all_tasks else 0.0,
            hours_total=hours_total,
            hours_done=hours_done,
            progress_percent=round(100 * hours_done / hours_total, 1) if hours_total else 0.0,
            by_status=by_status,
        )

        coursework = [t for t in all_tasks if t.task_type == TaskType.COURSEWORK]
        coursework_avg = (
            round(sum(self._effective_progress(t) for t in coursework) / len(coursework), 1)
            if coursework
            else 0.0
        )

        return WorkloadOut(
            range=range_,
            days=days,
            total_hours=total_hours,
            total_tasks=len(tasks),
            overall_risk=overall,
            burnout_warning=burnout,
            message=message,
            avg_hours_per_day=round(total_hours / days_count, 2),
            busiest_day=busiest_day,
            free_days=sum(1 for d in days if d.tasks_count == 0),
            by_subject=self._breakdown(
                tasks,
                key_fn=lambda t: str(t.subject_id),
                label_fn=lambda k: subject_names.get(uuid.UUID(k), NO_SUBJECT),
            ),
            by_type=self._breakdown(tasks, key_fn=lambda t: t.task_type.value),
            by_priority=self._breakdown(tasks, key_fn=lambda t: t.priority.value),
            completion=completion,
            overdue=[self._brief(t, subject_names, now) for t in overdue[:LIST_LIMIT]],
            upcoming=[self._brief(t, subject_names, now) for t in upcoming],
            coursework=[self._brief(t, subject_names, now) for t in coursework],
            coursework_avg_progress=coursework_avg,
        )
