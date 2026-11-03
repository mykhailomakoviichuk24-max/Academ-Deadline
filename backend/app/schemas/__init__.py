import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl

from app.models.enums import ReviewStatus, TaskPriority, TaskType


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- Auth ----
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(ORMModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str
    telegram_linked: bool = False
    created_at: datetime


# ---- Telegram ----
class TelegramLinkOut(BaseModel):
    token: str
    deep_link: str


# ---- Subjects ----
class SubjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    teacher_name: str = ""
    teacher_contact: str = ""
    resources_url: str | None = None


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(SubjectBase):
    pass


class SubjectOut(SubjectBase, ORMModel):
    id: uuid.UUID


# ---- Tasks ----
class TaskBase(BaseModel):
    subject_id: uuid.UUID
    title: str = Field(min_length=1, max_length=255)
    task_type: TaskType
    description: str | None = None
    deadline: datetime
    estimated_hours: float = Field(default=1.0, gt=0, le=500)
    priority: TaskPriority = TaskPriority.MEDIUM
    progress: int = Field(default=0, ge=0, le=100)


class TaskCreate(TaskBase):
    pass


class TaskUpdate(TaskBase):
    status: ReviewStatus | None = None
    review_notes: str | None = None


class TaskStatusUpdate(BaseModel):
    status: ReviewStatus
    review_notes: str | None = None
    deadline: datetime | None = None


class TaskProgressUpdate(BaseModel):
    progress: int = Field(ge=0, le=100)


class TaskOut(TaskBase, ORMModel):
    id: uuid.UUID
    status: ReviewStatus
    review_notes: str | None = None
    created_at: datetime
    updated_at: datetime


# ---- Analytics ----
class DayWorkload(BaseModel):
    date: str
    total_hours: float
    tasks_count: int
    risk: str  # LOW | MEDIUM | HIGH
    titles: list[str] = Field(default_factory=list)


class TaskBrief(BaseModel):
    id: uuid.UUID
    title: str
    subject: str
    task_type: TaskType
    priority: TaskPriority
    status: ReviewStatus
    deadline: datetime
    estimated_hours: float
    progress: int
    hours_left: float  # negative = overdue


class BreakdownItem(BaseModel):
    key: str
    label: str
    hours: float
    tasks: int


class CompletionStats(BaseModel):
    total_tasks: int
    accepted_tasks: int
    completion_percent: float  # accepted / all tasks
    hours_total: float
    hours_done: float  # accepted tasks count fully, others by their progress
    progress_percent: float  # hours_done / hours_total
    by_status: dict[str, int]


class WorkloadOut(BaseModel):
    range: str
    days: list[DayWorkload]
    total_hours: float
    total_tasks: int
    overall_risk: str
    burnout_warning: bool
    message: str
    avg_hours_per_day: float = 0.0
    busiest_day: DayWorkload | None = None
    free_days: int = 0
    by_subject: list[BreakdownItem] = Field(default_factory=list)
    by_type: list[BreakdownItem] = Field(default_factory=list)
    by_priority: list[BreakdownItem] = Field(default_factory=list)
    completion: CompletionStats | None = None
    overdue: list[TaskBrief] = Field(default_factory=list)
    upcoming: list[TaskBrief] = Field(default_factory=list)
    coursework: list[TaskBrief] = Field(default_factory=list)
    coursework_avg_progress: float = 0.0
