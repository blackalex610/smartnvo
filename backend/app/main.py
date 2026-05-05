from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from app.config import settings
from app.database import engine, Base
from app.routers import health, curriculum, exercises, progress, ai_chat, nvo, mobile_uploads, auth, plan, error_logs
from app.middleware.ip_rate_limiter import IPRateLimiterMiddleware
import app.models.curriculum  # noqa: ensure models are registered
import app.models.progress    # noqa: ensure models are registered
import app.models.user        # noqa: ensure models are registered

app = FastAPI(
    title="Math Learning Platform API",
    description="AI-powered math learning platform for Bulgarian 5th-7th grade students",
    version="1.0.0",
)

# Unconditionally inject CORS headers on every response (including 500 errors)
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "*"
    return response

# Also keep CORSMiddleware so OPTIONS pre-flight works
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(IPRateLimiterMiddleware)

# Include routers
app.include_router(health.router)
app.include_router(curriculum.router)
app.include_router(exercises.router)
app.include_router(progress.router)
app.include_router(ai_chat.router)
app.include_router(nvo.router)
app.include_router(mobile_uploads.router)
app.include_router(auth.router)
app.include_router(plan.router)
app.include_router(error_logs.router)

MEDIA_DIR = Path(__file__).resolve().parent / "uploads"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    # create_all is a no-op if tables already exist (safe for Postgres + SQLite)
    Base.metadata.create_all(bind=engine)
    print("🚀 Starting Math Learning Platform API...")
    print(f"📝 Environment: {settings.ENVIRONMENT}")
    print(f"🔗 Database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else settings.DATABASE_URL}")

@app.on_event("shutdown")
async def shutdown_event():
    """Clean up on shutdown"""
    print("👋 Shutting down Math Learning Platform API...")
