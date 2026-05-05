from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

from app.config import settings


_LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
_LOG_FILE = _LOG_DIR / "errors.jsonl"
_LOCK = threading.Lock()
_RATE_LOCK = threading.Lock()
_RATE_BUCKET: dict[str, list[float]] = {}
_RATE_LIMIT_COUNT = 20
_RATE_LIMIT_WINDOW_SECONDS = 60

_SENSITIVE_KEYS = {
    "password",
    "token",
    "access_token",
    "refresh_token",
    "authorization",
    "api_key",
    "secret",
    "cookie",
}


def _sanitize_value(value: Any) -> Any:
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            if k.lower() in _SENSITIVE_KEYS:
                out[k] = "[REDACTED]"
            else:
                out[k] = _sanitize_value(v)
        return out
    if isinstance(value, list):
        return [_sanitize_value(v) for v in value]
    if isinstance(value, str):
        lowered = value.lower()
        if "bearer " in lowered or "api_key" in lowered or "password" in lowered:
            return "[REDACTED]"
        if len(value) > 4000:
            return value[:4000] + "..."
        return value
    return value


def _minimal_for_production(entry: dict[str, Any]) -> dict[str, Any]:
    compact = {
        "level": entry.get("level", "error"),
        "message": entry.get("message", ""),
        "route": entry.get("route"),
        "user_id": entry.get("user_id"),
        "timestamp": entry.get("timestamp"),
    }
    stack = entry.get("stack")
    if stack and isinstance(stack, str):
        compact["stack"] = stack.splitlines()[0][:500]
    return compact


def allow_log_for_key(rate_key: str) -> bool:
    now = time.time()
    with _RATE_LOCK:
        timestamps = _RATE_BUCKET.setdefault(rate_key, [])
        cutoff = now - _RATE_LIMIT_WINDOW_SECONDS
        timestamps[:] = [t for t in timestamps if t >= cutoff]
        if len(timestamps) >= _RATE_LIMIT_COUNT:
            return False
        timestamps.append(now)
        return True


def append_error_log(entry: dict[str, Any]) -> None:
    safe_entry = _sanitize_value(entry)
    if settings.ENVIRONMENT.lower() == "production":
        safe_entry = _minimal_for_production(safe_entry)

    _LOG_DIR.mkdir(parents=True, exist_ok=True)
    line = json.dumps(safe_entry, ensure_ascii=False)

    with _LOCK:
        with _LOG_FILE.open("a", encoding="utf-8") as fp:
            fp.write(line + "\n")


def read_recent_logs(limit: int = 100) -> list[dict[str, Any]]:
    if not _LOG_FILE.exists():
        return []
    lines = _LOG_FILE.read_text(encoding="utf-8").splitlines()
    recent_lines = lines[-max(1, min(limit, 500)):]
    out: list[dict[str, Any]] = []
    for line in reversed(recent_lines):
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out
