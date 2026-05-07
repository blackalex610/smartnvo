from __future__ import annotations

from datetime import datetime, timedelta
from secrets import randbelow
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from jose import jwt
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.companion import CompanionDevice, CompanionSession

router = APIRouter(prefix="/companion", tags=["Companion Pairing"])

PAIRING_TTL_SECONDS = 10 * 60
SESSION_TTL_SECONDS = 3 * 60 * 60
MAX_PAIRED_DEVICES_PER_SESSION = 3


class CreateCompanionSessionRequest(BaseModel):
    exam_id: Optional[str] = None
    question_ids: list[str] = Field(default_factory=list)


class CreateCompanionSessionResponse(BaseModel):
    session_id: str
    pairing_code: str
    room_id: str
    pairing_expires_at: str
    session_expires_at: str


class PairCompanionRequest(BaseModel):
    pairing_code: str = Field(..., min_length=6, max_length=6)
    device_label: Optional[str] = Field(default=None, max_length=64)


class PairCompanionResponse(BaseModel):
    session_id: str
    room_id: str
    device_id: str
    companion_token: str
    question_ids: list[str]
    session_expires_at: str


def _now() -> datetime:
    return datetime.utcnow()


def _cleanup_expired(db: Session) -> None:
    now = _now()
    expired = (
        db.query(CompanionSession)
        .filter(CompanionSession.session_expires_at <= now)
        .all()
    )
    for session in expired:
        db.delete(session)
    if expired:
        db.commit()


def _generate_pairing_code(db: Session) -> str:
    # 6-digit numeric code with retry to avoid collisions for active sessions.
    now = _now()
    for _ in range(30):
        code = f"{randbelow(1_000_000):06d}"
        exists = (
            db.query(CompanionSession.id)
            .filter(
                CompanionSession.pairing_code == code,
                CompanionSession.is_active.is_(True),
                CompanionSession.session_expires_at > now,
            )
            .first()
        )
        if exists is None:
            return code
    raise HTTPException(status_code=503, detail="Could not allocate pairing code")


def _make_companion_jwt(session_id: str, device_id: str, session_expires_at: datetime) -> str:
    payload = {
        "sub": device_id,
        "session_id": session_id,
        "scope": "companion",
        "type": "companion",
        "exp": session_expires_at,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


@router.post("/sessions", response_model=CreateCompanionSessionResponse)
async def create_companion_session(payload: CreateCompanionSessionRequest, db: Session = Depends(get_db)):
    try:
        _cleanup_expired(db)

        now = _now()
        session = CompanionSession(
            session_id=str(uuid4()),
            pairing_code=_generate_pairing_code(db),
            exam_id=payload.exam_id,
            question_ids=list(payload.question_ids),
            created_at=now,
            pairing_expires_at=now + timedelta(seconds=PAIRING_TTL_SECONDS),
            session_expires_at=now + timedelta(seconds=SESSION_TTL_SECONDS),
            is_active=True,
        )

        db.add(session)
        db.commit()
        db.refresh(session)

        return CreateCompanionSessionResponse(
            session_id=session.session_id,
            pairing_code=session.pairing_code,
            room_id=f"session:{session.session_id}",
            pairing_expires_at=session.pairing_expires_at.isoformat(),
            session_expires_at=session.session_expires_at.isoformat(),
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


@router.post("/pair", response_model=PairCompanionResponse)
async def pair_companion(payload: PairCompanionRequest, db: Session = Depends(get_db)):
    try:
        _cleanup_expired(db)

        normalized_code = payload.pairing_code.strip()
        if not normalized_code.isdigit():
            raise HTTPException(status_code=400, detail="pairing_code must be numeric")

        now = _now()
        session = (
            db.query(CompanionSession)
            .filter(
                CompanionSession.pairing_code == normalized_code,
                CompanionSession.is_active.is_(True),
                CompanionSession.session_expires_at > now,
            )
            .first()
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Invalid pairing code")

        if session.pairing_expires_at <= now:
            raise HTTPException(status_code=410, detail="Pairing code expired")

        paired_count = (
            db.query(CompanionDevice)
            .filter(CompanionDevice.session_fk == session.id)
            .count()
        )
        if paired_count >= MAX_PAIRED_DEVICES_PER_SESSION:
            raise HTTPException(status_code=429, detail="Maximum paired devices reached")

        device_id = str(uuid4())
        device = CompanionDevice(
            device_id=device_id,
            session_fk=session.id,
            device_label=payload.device_label,
            paired_at=now,
            last_seen_at=now,
        )
        db.add(device)
        db.commit()

        companion_token = _make_companion_jwt(
            session_id=session.session_id,
            device_id=device_id,
            session_expires_at=session.session_expires_at,
        )

        return PairCompanionResponse(
            session_id=session.session_id,
            room_id=f"session:{session.session_id}",
            device_id=device_id,
            companion_token=companion_token,
            question_ids=[str(q) for q in (session.question_ids or [])],
            session_expires_at=session.session_expires_at.isoformat(),
        )
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database unavailable") from exc


@router.get("/sessions/{session_id}")
async def get_companion_session(session_id: str, db: Session = Depends(get_db)):
    try:
        _cleanup_expired(db)
        session = (
            db.query(CompanionSession)
            .filter(
                CompanionSession.session_id == session_id,
                CompanionSession.is_active.is_(True),
            )
            .first()
        )
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found")

        paired_count = (
            db.query(CompanionDevice)
            .filter(CompanionDevice.session_fk == session.id)
            .count()
        )

        return {
            "session_id": session.session_id,
            "room_id": f"session:{session.session_id}",
            "exam_id": session.exam_id,
            "question_ids": [str(q) for q in (session.question_ids or [])],
            "paired_device_count": paired_count,
            "pairing_expires_at": session.pairing_expires_at.isoformat(),
            "session_expires_at": session.session_expires_at.isoformat(),
        }
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status_code=503, detail="Database unavailable") from exc
