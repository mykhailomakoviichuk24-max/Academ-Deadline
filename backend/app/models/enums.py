import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, TypeDecorator


class TaskType(str, enum.Enum):
    LABORATORY = "LABORATORY"
    PRACTICAL = "PRACTICAL"
    COURSEWORK = "COURSEWORK"


class ReviewStatus(str, enum.Enum):
    TODO = "TODO"
    IN_PROGRESS = "IN_PROGRESS"
    UNDER_REVIEW = "UNDER_REVIEW"
    REQUIRES_CHANGES = "REQUIRES_CHANGES"
    ACCEPTED = "ACCEPTED"


class TaskPriority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class NotificationType(str, enum.Enum):
    THREE_DAYS_LEFT = "THREE_DAYS_LEFT"
    ONE_DAY_LEFT = "ONE_DAY_LEFT"
    TWO_HOURS_LEFT = "TWO_HOURS_LEFT"
    OVERDUE = "OVERDUE"


class UTCDateTime(TypeDecorator):
    """Always stores/returns timezone-aware UTC datetimes (works on SQLite and PostgreSQL)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
