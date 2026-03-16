import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.database import engine, Base
from app.services.scheduler_service import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting Aasha...")
    if engine is not None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        logger.info("Database tables created")
    else:
        logger.info("Running in Supabase-only mode (no local SQLAlchemy DB engine)")
    start_scheduler()
    yield
    # Shutdown
    stop_scheduler()
    if engine is not None:
        await engine.dispose()
    logger.info("Aasha stopped")


app = FastAPI(
    title="Aasha — Maternal Health Surveillance",
    description="AI-powered maternal health monitoring via SMS",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "healthy"}


# Serve built frontend (production only — in dev, Vite runs separately on :5173)
DIST_DIR = Path(__file__).parent.parent.parent / "frontend" / "dist"

if DIST_DIR.exists():
    # Serve compiled JS/CSS/image assets
    app.mount("/assets", StaticFiles(directory=DIST_DIR / "assets"), name="assets")

    # SPA catch-all — must be registered AFTER the API router so /api/* routes win
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        candidate = DIST_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")
else:
    @app.get("/")
    async def root():
        return {"status": "Aasha is running", "version": "1.0.0"}
