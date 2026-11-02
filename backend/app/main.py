from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import init_db
from app.routers import analytics, auth, subjects, tasks, telegram


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Bot object is created only for the webhook endpoint; polling + scheduler
    # run in the dedicated `bot` service (app.bot.runner).
    from app.bot.runner import create_bot, create_dispatcher

    app.state.bot = create_bot()
    app.state.dispatcher = create_dispatcher() if app.state.bot else None
    yield
    if app.state.bot:
        await app.state.bot.session.close()


def create_app() -> FastAPI:
    app = FastAPI(title="Academic Deadline & Task Tracker", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (auth.router, telegram.router, subjects.router, tasks.router, analytics.router):
        app.include_router(r)

    @app.get("/api/health", tags=["health"])
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
