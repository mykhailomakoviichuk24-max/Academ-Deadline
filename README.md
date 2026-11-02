# Academic Deadline & Task Tracker

Вебсервіс для трекінгу дедлайнів, курсових та лабораторних робіт: Kanban-дошка, аналітика навантаження та Telegram-бот із автоматичними нагадуваннями.

**Стек:** Angular 18 (standalone, signals, CDK drag-drop) · FastAPI (async) · PostgreSQL + SQLAlchemy 2.0 · aiogram 3 · APScheduler · Docker Compose.

## Швидкий старт (Docker)

```bash
cp .env.example .env        # вкажіть SECRET_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME
docker compose up --build
```

- Веб: http://localhost:4200
- API + Swagger: http://localhost:8000/docs
- Сервіс `bot` запускає long-polling бота та демон нагадувань (кожні 60 с). Без `TELEGRAM_BOT_TOKEN` він просто завершується, решта системи працює.

## Локальна розробка

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
DATABASE_URL=sqlite+aiosqlite:///./dev.db uvicorn app.main:app --reload

# тести (SQLite, без зовнішніх сервісів)
python -m pytest

# bot + scheduler (потрібен токен)
python -m app.bot.runner

# frontend
cd frontend
npm install
npm start                    # http://localhost:4200, /api проксується на :8000
```

## Структура

```
backend/app
  core/          config, database, security (JWT, bcrypt), deps
  models/        SQLAlchemy: User, Subject, Task, NotificationQueue + enums
  schemas/       Pydantic v2 DTO
  repositories/  доступ до БД, кожен запит фільтрується по user_id
  services/      AuthService, TaskService, WorkloadService
  routers/       auth, telegram, subjects, tasks, analytics
  bot/           handlers (aiogram), service, scheduler (APScheduler), runner
backend/tests/   функціональні тести (auth, tasks, telegram/scheduler, workload)
frontend/src/app
  core/          interceptor JWT, guard, API-сервіси, моделі
  features/      auth, kanban, subjects, workload
```

## Ключова поведінка

- Створення завдання автоматично ставить у `NotificationQueue` тригери за 72 год, 24 год, 2 год і в момент дедлайну (минулі тригери пропускаються).
- `PATCH /api/tasks/{id}/status`: статус `ACCEPTED` позначає невідправлені сповіщення як пропущені; зміна `deadline` перегенерує чергу.
- Ризик навантаження: день < 4 год — LOW, 4–8 — MEDIUM, ≥ 8 — HIGH; попередження про вигорання при HIGH-дні або кількох напружених днях поспіль.
- Telegram: `POST /api/telegram/generate-link` → `t.me/<bot>?start=<token>`; токен одноразовий. Команди `/today`, `/deadlines`, `/status`.

## Примітки

- Час дедлайнів зберігається в UTC; фронтенд показує локальний час браузера, бот — UTC.
- Для вебхука замість polling встановіть webhook Telegram на `POST /api/telegram/webhook` (потрібен HTTPS).
- У продакшені замініть `create_all` на міграції (Alembic).
