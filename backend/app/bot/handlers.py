"""aiogram 3.x handlers."""
from aiogram import Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import Message

from app.bot.service import TelegramBotService
from app.core.database import SessionLocal

router = Router()

NOT_LINKED = "Акаунт не прив'язано. Згенеруйте посилання у веб-застосунку."


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject) -> None:
    token = (command.args or "").strip()
    if not token:
        await message.answer(
            "Привіт! Щоб прив'язати акаунт, натисніть кнопку Telegram у веб-застосунку.\n"
            "Команди: /today, /deadlines, /status"
        )
        return
    async with SessionLocal() as session:
        ok = await TelegramBotService(session).link_account(token, message.chat.id)
    await message.answer("Account successfully linked!" if ok else "Недійсний або використаний токен.")


async def _with_user(message: Message, method: str) -> None:
    async with SessionLocal() as session:
        svc = TelegramBotService(session)
        user = await svc.get_user(message.chat.id)
        if user is None:
            await message.answer(NOT_LINKED)
            return
        text = await getattr(svc, method)(user)
    await message.answer(text, parse_mode="HTML")


@router.message(Command("today"))
async def cmd_today(message: Message) -> None:
    await _with_user(message, "today_text")


@router.message(Command("deadlines"))
async def cmd_deadlines(message: Message) -> None:
    await _with_user(message, "deadlines_text")


@router.message(Command("status"))
async def cmd_status(message: Message) -> None:
    await _with_user(message, "status_text")
