import secrets
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class SecurityService:
    @staticmethod
    def hash_password(password: str) -> str:
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        return pwd_context.verify(password, hashed)

    @staticmethod
    def _create_token(subject: str, token_type: str, expires: timedelta) -> str:
        now = datetime.now(timezone.utc)
        claims = {"sub": subject, "type": token_type, "iat": now, "exp": now + expires}
        return jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)

    @classmethod
    def create_access_token(cls, user_id: str) -> str:
        return cls._create_token(
            user_id, "access", timedelta(minutes=settings.access_token_expire_minutes)
        )

    @classmethod
    def create_refresh_token(cls, user_id: str) -> str:
        return cls._create_token(
            user_id, "refresh", timedelta(days=settings.refresh_token_expire_days)
        )

    @staticmethod
    def decode_token(token: str, expected_type: str = "access") -> str | None:
        """Returns user id (sub) or None if token is invalid."""
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        except JWTError:
            return None
        if payload.get("type") != expected_type:
            return None
        return payload.get("sub")

    @staticmethod
    def generate_link_token() -> str:
        """One-time token for Telegram deep-link binding."""
        return secrets.token_urlsafe(24)
