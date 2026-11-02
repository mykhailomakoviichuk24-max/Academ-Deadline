import uuid
from datetime import datetime

from sqlalchemy import Boolean, Enum, ForeignKey, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import NotificationType, UTCDateTime


class NotificationQueue(Base):
    __tablename__ = "notification_queue"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    trigger_time: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType, name="notification_type"))
    is_sent: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
