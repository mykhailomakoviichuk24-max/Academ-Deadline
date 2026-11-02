import uuid

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(255))
    teacher_name: Mapped[str] = mapped_column(String(255), default="")
    teacher_contact: Mapped[str] = mapped_column(String(255), default="")
    resources_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
