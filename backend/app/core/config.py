from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://tracker:tracker@db:5432/tracker"
    secret_key: str = "change-me-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 7
    cors_origins: str = "http://localhost:4200"
    telegram_bot_token: str = ""
    telegram_bot_username: str = "deadline_tracker_bot"
    scheduler_interval_seconds: int = 60
    run_bot_polling: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
