from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.core.deps import get_current_user
from app.core.security import SecurityService
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas import TelegramLinkOut

router = APIRouter(prefix="/api/telegram", tags=["telegram"])


@router.post("/generate-link", response_model=TelegramLinkOut)
async def generate_link(
    user: User = Depends(get_current_user), session: AsyncSession = Depends(get_session)
):
    token = SecurityService.generate_link_token()
    user.telegram_link_token = token
    await UserRepository(session).save(user)
    return TelegramLinkOut(
        token=token, deep_link=f"https://t.me/{settings.telegram_bot_username}?start={token}"
    )


@router.post("/webhook")
async def webhook(request: Request):
    """Telegram webhook (alternative to long polling)."""
    bot = getattr(request.app.state, "bot", None)
    dp = getattr(request.app.state, "dispatcher", None)
    if bot is None or dp is None:
        return {"ok": False, "detail": "bot not configured"}
    from aiogram.types import Update

    update = Update.model_validate(await request.json(), context={"bot": bot})
    await dp.feed_update(bot, update)
    return {"ok": True}
