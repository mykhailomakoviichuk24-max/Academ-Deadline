"""Teacher use cases: groups, issuing tasks to students, reviewing submissions."""
import secrets
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import ReviewStatus
from app.models.group import Group
from app.models.subject import Subject
from app.models.task import Task
from app.models.user import User
from app.repositories.subject_repository import SubjectRepository
from app.repositories.task_repository import TaskRepository
from app.schemas import (
    AssignmentCreate,
    GroupDayLoad,
    GroupOut,
    ReviewRequest,
    StudentStats,
    SubjectStat,
    TaskCreate,
    TaskStatusUpdate,
    TeacherAnalytics,
    TeacherTaskOut,
    TypeStat,
)
from app.services.task_service import TaskService
from app.services.workload_service import day_risk


class TeacherService:
    def __init__(self, session: AsyncSession, teacher: User):
        self.session = session
        self.teacher = teacher
        self.tasks = TaskRepository(session)
        self.task_service = TaskService(self.tasks, SubjectRepository(session))

    # ---- groups ----
    async def _own_group(self, group_id: uuid.UUID) -> Group:
        res = await self.session.execute(
            select(Group).where(Group.id == group_id, Group.teacher_id == self.teacher.id)
        )
        group = res.scalar_one_or_none()
        if group is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Group not found")
        return group

    async def _students_count(self, group_id: uuid.UUID) -> int:
        res = await self.session.execute(
            select(func.count()).select_from(User).where(User.group_id == group_id)
        )
        return int(res.scalar_one())

    async def list_groups(self) -> list[GroupOut]:
        res = await self.session.execute(
            select(Group).where(Group.teacher_id == self.teacher.id).order_by(Group.name)
        )
        return [
            GroupOut(
                id=g.id,
                name=g.name,
                invite_code=g.invite_code,
                students_count=await self._students_count(g.id),
            )
            for g in res.scalars()
        ]

    async def create_group(self, name: str) -> GroupOut:
        code = secrets.token_hex(3).upper()
        while (
            await self.session.execute(select(Group.id).where(Group.invite_code == code))
        ).first():
            code = secrets.token_hex(3).upper()
        group = Group(teacher_id=self.teacher.id, name=name.strip(), invite_code=code)
        self.session.add(group)
        await self.session.commit()
        await self.session.refresh(group)
        return GroupOut(id=group.id, name=group.name, invite_code=group.invite_code, students_count=0)

    async def _students(self, group_id: uuid.UUID) -> list[User]:
        res = await self.session.execute(
            select(User).where(User.group_id == group_id).order_by(User.full_name)
        )
        return list(res.scalars())

    async def students_stats(self, group_id: uuid.UUID) -> list[StudentStats]:
        await self._own_group(group_id)
        now = datetime.now(timezone.utc)
        out: list[StudentStats] = []
        for s in await self._students(group_id):
            res = await self.session.execute(
                select(Task).where(Task.user_id == s.id, Task.assigned_by == self.teacher.id)
            )
            tasks = list(res.scalars())
            progress = [100 if t.status == ReviewStatus.ACCEPTED else t.progress for t in tasks]
            out.append(
                StudentStats(
                    id=s.id,
                    full_name=s.full_name,
                    email=s.email,
                    total_tasks=len(tasks),
                    accepted=sum(t.status == ReviewStatus.ACCEPTED for t in tasks),
                    under_review=sum(t.status == ReviewStatus.UNDER_REVIEW for t in tasks),
                    overdue=sum(
                        t.status != ReviewStatus.ACCEPTED and t.deadline < now for t in tasks
                    ),
                    avg_progress=round(sum(progress) / len(progress), 1) if progress else 0.0,
                )
            )
        return out

    # ---- analytics ----
    @staticmethod
    def _progress(t: Task) -> int:
        return 100 if t.status == ReviewStatus.ACCEPTED else t.progress

    async def analytics(self, group_id: uuid.UUID | None = None, days: int = 14) -> TeacherAnalytics:
        """Aggregated picture of everything this teacher has issued (one group or all)."""
        now = datetime.now(timezone.utc)
        if group_id is not None:
            await self._own_group(group_id)
            group_ids = [group_id]
        else:
            res = await self.session.execute(select(Group.id).where(Group.teacher_id == self.teacher.id))
            group_ids = list(res.scalars())
        students: list[User] = []
        for gid in group_ids:
            students += await self._students(gid)
        by_student: dict[uuid.UUID, list[Task]] = {s.id: [] for s in students}
        subject_names: dict[uuid.UUID, str] = {}
        tasks: list[Task] = []
        if students:
            res = await self.session.execute(
                select(Task).where(
                    Task.assigned_by == self.teacher.id, Task.user_id.in_(list(by_student))
                )
            )
            tasks = list(res.scalars())
            for t in tasks:
                by_student[t.user_id].append(t)
            res = await self.session.execute(
                select(Subject.id, Subject.name).where(
                    Subject.id.in_({t.subject_id for t in tasks})
                )
            )
            subject_names = {sid: name for sid, name in res.all()}

        def is_late(t: Task) -> bool:
            return t.status != ReviewStatus.ACCEPTED and t.deadline < now

        def avg(items: list[Task]) -> float:
            return round(sum(self._progress(t) for t in items) / len(items), 1) if items else 0.0

        by_status = {s.value: 0 for s in ReviewStatus}
        for t in tasks:
            by_status[t.status.value] += 1

        by_type: dict[str, list[Task]] = defaultdict(list)
        by_subject: dict[str, list[Task]] = defaultdict(list)
        for t in tasks:
            by_type[t.task_type.value].append(t)
            by_subject[subject_names.get(t.subject_id, "Без предмета")].append(t)

        # load: hours of unfinished work by deadline day, over all students and per student
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        hours: dict[str, float] = defaultdict(float)
        counts: dict[str, int] = defaultdict(int)
        for t in tasks:
            if t.status == ReviewStatus.ACCEPTED:
                continue
            key = t.deadline.date().isoformat()
            hours[key] += t.estimated_hours
            counts[key] += 1
        n = max(len(students), 1)
        load = []
        for i in range(days):
            key = (start + timedelta(days=i)).date().isoformat()
            per = round(hours.get(key, 0.0) / n, 2)
            load.append(
                GroupDayLoad(
                    date=key,
                    tasks=counts.get(key, 0),
                    hours=round(hours.get(key, 0.0), 2),
                    hours_per_student=per,
                    risk=day_risk(per),
                )
            )
        busiest = max(load, key=lambda d: d.hours) if load else None

        stats = []
        for s in students:
            own = by_student[s.id]
            stats.append(
                StudentStats(
                    id=s.id,
                    full_name=s.full_name,
                    email=s.email,
                    total_tasks=len(own),
                    accepted=sum(t.status == ReviewStatus.ACCEPTED for t in own),
                    under_review=sum(t.status == ReviewStatus.UNDER_REVIEW for t in own),
                    overdue=sum(is_late(t) for t in own),
                    avg_progress=avg(own),
                )
            )
        stats.sort(key=lambda s: (-s.overdue, s.avg_progress, s.full_name))

        accepted = by_status[ReviewStatus.ACCEPTED.value]
        return TeacherAnalytics(
            students_count=len(students),
            tasks_total=len(tasks),
            by_status=by_status,
            overdue=sum(is_late(t) for t in tasks),
            completion_percent=round(100 * accepted / len(tasks), 1) if tasks else 0.0,
            avg_progress=avg(tasks),
            review_queue=by_status[ReviewStatus.UNDER_REVIEW.value],
            by_type=[
                TypeStat(
                    key=k,
                    total=len(v),
                    accepted=sum(t.status == ReviewStatus.ACCEPTED for t in v),
                    avg_progress=avg(v),
                )
                for k, v in sorted(by_type.items())
            ],
            by_subject=sorted(
                (
                    SubjectStat(
                        subject=k,
                        total=len(v),
                        accepted=sum(t.status == ReviewStatus.ACCEPTED for t in v),
                        overdue=sum(is_late(t) for t in v),
                        avg_progress=avg(v),
                    )
                    for k, v in by_subject.items()
                ),
                key=lambda s: (-s.overdue, s.subject),
            ),
            load=load,
            busiest_day=busiest if busiest and busiest.hours > 0 else None,
            students=stats,
        )

    async def remove_student(self, group_id: uuid.UUID, student_id: uuid.UUID) -> None:
        await self._own_group(group_id)
        res = await self.session.execute(
            select(User).where(User.id == student_id, User.group_id == group_id)
        )
        student = res.scalar_one_or_none()
        if student is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Student not found in the group")
        student.group_id = None
        await self.session.commit()

    # ---- issuing tasks ----
    async def assign(self, data: AssignmentCreate) -> int:
        await self._own_group(data.group_id)
        students = await self._students(data.group_id)
        if data.student_ids is not None:
            wanted = set(data.student_ids)
            students = [s for s in students if s.id in wanted]
        if not students:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No students to assign the task to")

        subject_name = data.subject_name.strip()
        own = await self.session.execute(
            select(Subject).where(Subject.user_id == self.teacher.id, Subject.name == subject_name)
        )
        catalog_subject = own.scalars().first()
        if catalog_subject is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, "Subject not found: create it in the Subjects tab first"
            )
        for student in students:
            res = await self.session.execute(
                select(Subject).where(Subject.user_id == student.id, Subject.name == subject_name)
            )
            subject = res.scalars().first()
            if subject is None:
                subject = Subject(
                    user_id=student.id,
                    name=subject_name,
                    teacher_name=self.teacher.full_name,
                    teacher_contact=self.teacher.email,
                    resources_url=catalog_subject.resources_url,
                )
                self.session.add(subject)
                await self.session.flush()
            await self.task_service.create(
                student.id,
                TaskCreate(
                    subject_id=subject.id,
                    title=data.title,
                    task_type=data.task_type,
                    description=data.description,
                    deadline=data.deadline,
                    estimated_hours=data.estimated_hours,
                    priority=data.priority,
                ),
                assigned_by=self.teacher.id,
            )
        return len(students)

    # ---- review ----
    def _query(self):
        return (
            select(Task, User, Subject)
            .join(User, User.id == Task.user_id)
            .join(Subject, Subject.id == Task.subject_id)
            .where(Task.assigned_by == self.teacher.id)
        )

    @staticmethod
    def _out(task: Task, student: User, subject: Subject) -> TeacherTaskOut:
        return TeacherTaskOut(
            id=task.id,
            student_id=student.id,
            student_name=student.full_name,
            subject_name=subject.name,
            title=task.title,
            task_type=task.task_type,
            deadline=task.deadline,
            estimated_hours=task.estimated_hours,
            priority=task.priority,
            status=task.status,
            review_notes=task.review_notes,
            progress=100 if task.status == ReviewStatus.ACCEPTED else task.progress,
        )

    async def list_tasks(
        self, group_id: uuid.UUID | None = None, status_: ReviewStatus | None = None
    ) -> list[TeacherTaskOut]:
        q = self._query()
        if group_id is not None:
            await self._own_group(group_id)
            q = q.where(User.group_id == group_id)
        if status_ is not None:
            q = q.where(Task.status == status_)
        res = await self.session.execute(q.order_by(Task.deadline))
        return [self._out(t, u, s) for t, u, s in res.all()]

    async def _one(self, task_id: uuid.UUID) -> TeacherTaskOut:
        res = await self.session.execute(self._query().where(Task.id == task_id))
        row = res.first()
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found")
        return self._out(*row)

    async def review(self, task_id: uuid.UUID, data: ReviewRequest) -> TeacherTaskOut:
        current = await self._one(task_id)  # 404 unless issued by this teacher
        await self.task_service.update_status(
            current.student_id,
            task_id,
            TaskStatusUpdate(status=ReviewStatus(data.status), review_notes=data.review_notes),
            by_teacher=True,
        )
        return await self._one(task_id)

    async def cancel(self, task_id: uuid.UUID) -> None:
        current = await self._one(task_id)
        task = await self.tasks.get(current.student_id, task_id)
        if task is not None:
            await self.tasks.delete(task)
