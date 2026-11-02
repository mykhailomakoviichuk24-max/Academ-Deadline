"""Bot factory + standalone runner (separate `bot` docker service)."""
import asyncio
import logging

from aiogram import Bot, Dispatcher

from app.bot.handlers import router
from app.bot.scheduler import SchedulerDaemon
from app.core.config import settings
from app.core.database import init_db


def create_bot() -> Bot | None:
    if not settings.telegram_bot_token:
        return None
    return Bot(token=settings.telegram_bot_token)


def create_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.include_router(router)
    return dp


async def run_bot() -> None:
    """Long-polling bot + notification daemon in one process."""
    logging.basicConfig(level=logging.INFO)
    bot = create_bot()
    if bot is None:
        logging.warning("TELEGRAM_BOT_TOKEN is not set; bot is idle (set the token and restart)")
        await asyncio.Event().wait()  # stay alive so Docker doesn't restart-loop
        return
    await init_db()

    async def send(chat_id: int, text: str) -> None:
        await bot.send_message(chat_id, text, parse_mode="HTML")

    daemon = SchedulerDaemon(send)
    daemon.start()
    try:
        await create_dispatcher().start_polling(bot)
    finally:
        daemon.stop()
        await bot.session.close()


if __name__ == "__main__":
    asyncio.run(run_bot())
