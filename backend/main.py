from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from database import close_pool, create_pool
from routers import comments, dashboard, health, projects, reports, stages, workflow_settings
from services.scheduler import build_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    app.state.settings = settings
    app.state.db_pool = await create_pool(settings.database_url)
    app.state.scheduler = build_scheduler(app)

    if settings.enable_scheduler:
        app.state.scheduler.start()

    try:
        yield
    finally:
        scheduler = getattr(app.state, "scheduler", None)
        if scheduler is not None and scheduler.running:
            scheduler.shutdown(wait=False)
        await close_pool(getattr(app.state, "db_pool", None))


settings = get_settings()
app = FastAPI(
    title="Kian Falcon Workflow Tracker API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(projects.router)
app.include_router(stages.router)
app.include_router(comments.router)
app.include_router(dashboard.router)
app.include_router(reports.router)
app.include_router(workflow_settings.router)
