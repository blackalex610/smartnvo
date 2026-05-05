"""
Auth dependencies: JWT decoding, plan limit enforcement.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, Header
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User

# ─── Plan limits ──────────────────────────────────────────────────────────────

FREE_LIMITS = {
    "ai_exercises":  10,   # 10 AI exercises / day
    "ai_chat":       15,   # 15 chat messages / day
    "nvo_exams":      2,   # 2 NVO simulations / day
    "image_scans":    3,   # 3 photo uploads / day
}

PREMIUM_LIMITS = {
    "ai_exercises":  999_999,
    "ai_chat":       999_999,
    "nvo_exams":     999_999,
    "image_scans":   999_999,
}

FEATURE_LABELS = {
    "ai_exercises": "AI задачи",
    "ai_chat":      "AI съобщения",
    "nvo_exams":    "НВО изпита",
    "image_scans":  "снимки",
}


def _get_limits(user: User) -> dict:
    return PREMIUM_LIMITS if user.plan == "premium" else FREE_LIMITS


def _reset_if_new_day(user: User) -> None:
    """Reset daily counters if the calendar day has changed."""
    today = date.today()
    if user.usage_reset_date != today:
        user.ai_exercises_today = 0
        user.ai_chat_today = 0
        user.nvo_exams_today = 0
        user.image_scans_today = 0
        user.usage_reset_date = today


# ─── Core dependency ──────────────────────────────────────────────────────────

def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization[7:]
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub", 0))
    except (JWTError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    _reset_if_new_day(user)
    db.commit()
    return user


def get_optional_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Returns user or None — for endpoints accessible to both auth'd and anon users."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        return get_current_user(authorization=authorization, db=db)
    except HTTPException:
        return None


# ─── Limit-gated dependencies ─────────────────────────────────────────────────

def _check_and_increment(user: User, db: Session, feature: str) -> User:
    limits = _get_limits(user)
    used: int = getattr(user, f"{feature}_today")
    limit: int = limits[feature]
    label = FEATURE_LABELS.get(feature, feature)

    if used >= limit:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "LIMIT_REACHED",
                "feature": feature,
                "limit": limit,
                "used": used,
                "plan": user.plan,
                "message": (
                    f"Достигнахте дневния лимит от {limit} {label}. "
                    "Надградете до Premium за неограничен достъп."
                ),
            },
        )

    setattr(user, f"{feature}_today", used + 1)
    db.commit()
    return user


def _optional_limit_check(
    authorization: Optional[str],
    db: Session,
    feature: str,
) -> Optional[User]:
    """If a valid JWT is present, enforce limits. If no auth, allow freely."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    try:
        user = get_current_user(authorization=authorization, db=db)
    except HTTPException:
        return None
    return _check_and_increment(user, db, feature)


def require_ai_exercise(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    return _optional_limit_check(authorization, db, "ai_exercises")


def require_ai_chat(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    return _optional_limit_check(authorization, db, "ai_chat")


def require_nvo_exam(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    return _optional_limit_check(authorization, db, "nvo_exams")


def require_image_scan(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    return _optional_limit_check(authorization, db, "image_scans")


# ─── AI chat cooldown (2 seconds between messages) ────────────────────────────

CHAT_COOLDOWN_SECONDS = 2


def check_chat_cooldown(user: User, db: Session) -> None:
    """Raise 429 if the user sent a chat message less than CHAT_COOLDOWN_SECONDS ago."""
    if user.last_ai_chat_at is None:
        return
    now = datetime.now(timezone.utc)
    last = (
        user.last_ai_chat_at.replace(tzinfo=timezone.utc)
        if user.last_ai_chat_at.tzinfo is None
        else user.last_ai_chat_at
    )
    elapsed = (now - last).total_seconds()
    if elapsed < CHAT_COOLDOWN_SECONDS:
        wait = round(CHAT_COOLDOWN_SECONDS - elapsed, 1)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "COOLDOWN",
                "wait_seconds": wait,
                "message": f"Изчакайте {wait}s преди следващото съобщение.",
            },
        )


def update_last_chat_at(user: User, db: Session) -> None:
    user.last_ai_chat_at = datetime.now(timezone.utc)
    db.commit()


def require_image_scan(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> Optional[User]:
    return _optional_limit_check(authorization, db, "image_scans")


# ─── AI chat cooldown (2 seconds between messages) ────────────────────────────

CHAT_COOLDOWN_SECONDS = 2


def check_chat_cooldown(user: User, db: Session) -> None:
    """Raise 429 if the user sent a chat message less than CHAT_COOLDOWN_SECONDS ago."""
    if user.last_ai_chat_at is None:
        return
    now = datetime.now(timezone.utc)
    last = user.last_ai_chat_at.replace(tzinfo=timezone.utc) if user.last_ai_chat_at.tzinfo is None else user.last_ai_chat_at
    elapsed = (now - last).total_seconds()
    if elapsed < CHAT_COOLDOWN_SECONDS:
        wait = round(CHAT_COOLDOWN_SECONDS - elapsed, 1)
        raise HTTPException(
            status_code=429,
            detail={
                "code": "COOLDOWN",
                "wait_seconds": wait,
                "message": f"Изчакайте {wait}s преди следващото съобщение.",
            },
        )


def update_last_chat_at(user: User, db: Session) -> None:
    user.last_ai_chat_at = datetime.now(timezone.utc)
    db.commit()
