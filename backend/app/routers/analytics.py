from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/analytics", tags=["analytics"])

# Append-only analytics storage (MVP)
_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
_ANALYTICS_FILE = _LOG_DIR / "analytics_events.jsonl"
_LOCK = threading.Lock()


class AnalyticsEventPayload(BaseModel):
    event_type: Literal[
        "login",
        "logout",
        "lesson_started",
        "lesson_completed",
        "exercise_completed",
        "ai_request",
        "nvo_started",
        "nvo_completed",
        "premium_clicked",
    ]
    user_id: Optional[str] = Field(default=None, max_length=128)
    timestamp: str = Field(..., max_length=40)
    metadata: dict[str, Any] = Field(default_factory=dict)


def _append_event(entry: dict[str, Any]) -> None:
    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    line = json.dumps(entry, ensure_ascii=False)
    with _LOCK:
        with _ANALYTICS_FILE.open("a", encoding="utf-8") as fp:
            fp.write(line + "\n")


@router.post("/events", status_code=201)
async def create_analytics_event(payload: AnalyticsEventPayload):
    entry = payload.model_dump()
    entry["received_at"] = datetime.utcnow().isoformat()
    _append_event(entry)
    return {"success": True}
