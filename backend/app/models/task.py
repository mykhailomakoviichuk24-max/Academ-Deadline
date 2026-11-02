import uuid
from datetime import datetime

from sqlalchemy import Enum, Float, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import (
    ReviewStatus,
    TaskPriority,
    TaskType,
    UTCDateTime,
    utcnow,
)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    subject_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("subjects.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(255))
    task_type: Mapped[TaskType] = mapped_column(Enum(TaskType, name="task_type"))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    estimated_hours: Mapped[float] = mapped_column(Float, default=1.0)
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, name="task_priority"), default=TaskPriority.MEDIUM
    )
    status: Mapped[ReviewStatus] = mapped_column(
        Enum(ReviewStatus, name="review_status"), default=ReviewStatus.TODO, index=True
    )
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)
