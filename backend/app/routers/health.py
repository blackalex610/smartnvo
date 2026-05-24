from fastapi import APIRouter
from datetime import datetime
from app.database import engine, Base

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Health check endpoint to verify the API is running
    """
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "Math Learning Platform API",
        "version": "1.0.0",
    }


@router.post("/admin/migrate")
async def run_migrations():
    """Create all DB tables if they don't exist (idempotent). Call once after deploy."""
    try:
        Base.metadata.create_all(bind=engine)
        return {"status": "ok", "message": "Tables created / verified successfully"}
    except Exception as exc:
        return {"status": "error", "message": str(exc)}
