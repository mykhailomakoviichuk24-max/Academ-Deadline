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

## Нове: прогрес курсових, календар, розширена аналітика
- **Прогрес курсових:** у завданнях типу «Курсова» є поле готовності 0–100% (повзунок у формі, кнопки ±10% на картці, `PATCH /api/tasks/{id}/progress`). Статус «Прийнято» ставить 100%.
- **Календар** (`/calendar`): місячна сітка з дедлайнами завдань, фільтр за предметом, панель вибраного дня.
- **Навантаження:** середнє на день, найзавантаженіший день, прострочені та найближчі дедлайни, розбивка за предметами/типами/пріоритетами, виконання за весь час, прогрес курсових.
- Колонка `tasks.progress` додається в існуючу БД автоматично при старті (`ALTER TABLE ... IF NOT EXISTS`).

## Ролі: студент і викладач

| | Студент | Викладач |
| --- | --- | --- |
| Реєстрація | звичайна, за бажанням з кодом групи | з кодом доступу `TEACHER_ACCESS_CODE` з `.env` |
| Предмети (створення, зміна, видалення) | ні, лише бачить отримані від викладача | так, вкладка «Предмети» |
| Свої завдання, календар, навантаження | так | ні (окремий кабінет `/teacher`) |
| Групи | вступає за кодом групи | створює групи, бачить склад і успішність |
| Завдання | створює собі сам | видає групі або вибраним студентам, обравши свій предмет (студенту він додається автоматично) |
| Статуси | лише «До виконання», «В роботі», «На перевірці» (для будь-яких своїх завдань) | приймає (ACCEPTED) або повертає на правки (REQUIRES_CHANGES) з коментарем |
| Видані завдання | не можна редагувати чи видаляти | може скасувати |

Налаштування: у `.env` задайте `TEACHER_ACCESS_CODE=ваш-секретний-код` (порожнє значення вимикає реєстрацію викладачів),
потім `docker compose up -d --build`. Нові колонки в існуючій БД додаються автоматично під час старту API.

## Кольори типів робіт і аналітика викладача

- Лабораторна — синій, практична — рожевий, курсова — жовтий. Колір видно на картках канбану, у календарі, у списках навантаження та в кабінеті викладача; легенда є на канбані й календарі.
- Кабінет викладача → вкладка «Аналітика» (`GET /api/teacher/analytics?group_id=&days=`): KPI (студенти, видано, прийнято %, середня готовність, прострочено, чекають перевірки), розподіл за статусами, розріз за типом роботи й за предметами, навантаження групи по днях (години й ризик на одного студента) і рейтинг студентів, де проблемні зверху.
