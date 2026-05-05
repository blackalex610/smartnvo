from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from jose import jwt
from pydantic import BaseModel
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.auth.dependencies import get_current_user, FREE_LIMITS

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleToken(BaseModel):
    token: str


def _make_jwt(user_id: int) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )


@router.post("/google")
async def google_login(body: GoogleToken, request: Request, db: Session = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth is not configured")

    try:
        info = id_token.verify_oauth2_token(
            body.token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid Google token") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Google token verification failed") from exc

    google_sub = info.get("sub")
    email = info.get("email", "")
    name = info.get("name", "")
    picture = info.get("picture", "")

    # Upsert user
    client_ip = (
        (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
        or (request.client.host if request.client else None)
    )

    try:
        user = db.query(User).filter(User.google_sub == google_sub).first()
        if not user:
            user = User(
                google_sub=google_sub,
                email=email,
                name=name,
                picture=picture,
                last_login_ip=client_ip,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # Sync latest profile info
            user.name = name
            user.picture = picture
            user.last_login_ip = client_ip
            db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database unavailable") from exc

    token = _make_jwt(user.id)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "plan": user.plan,
        },
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Return current user info + plan status."""
    limits = FREE_LIMITS if current_user.plan == "free" else {k: 999_999 for k in FREE_LIMITS}
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "picture": current_user.picture,
        "plan": current_user.plan,
        "usage": {
            "ai_exercises": {"used": current_user.ai_exercises_today, "limit": limits["ai_exercises"]},
            "ai_chat": {"used": current_user.ai_chat_today, "limit": limits["ai_chat"]},
            "nvo_exams": {"used": current_user.nvo_exams_today, "limit": limits["nvo_exams"]},
        },
    }
