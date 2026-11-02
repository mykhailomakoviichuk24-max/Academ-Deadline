import uuid
from datetime import datetime

from sqlalchemy import BigInteger, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import UTCDateTime, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(255))
    telegram_chat_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    telegram_link_token: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
