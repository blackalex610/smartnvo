# Saved Problems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in student bookmark an individual practice exercise or NVO exam question and review it later from a dedicated page.

**Architecture:** One `saved_problems` table storing a full JSON *snapshot* of each problem rather than a reference, because NVO questions have no durable id and their generated exam is evicted after 24h. Both sources normalise onto a single snapshot schema, so the review page has one renderer. A thin FastAPI router sits over a service module; the frontend holds saved state in a React context so bookmark buttons on different pages agree.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (legacy `Column` style), Alembic, pytest — React 19, TypeScript, Vite, Tailwind CSS v4, axios, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-20-saved-problems-design.md`

## Global Constraints

- **All user-facing text is Bulgarian**, written inline in JSX. No i18n library exists; do not introduce one.
- **Icon-only buttons must carry a Bulgarian `aria-label` and `title`** — frontend tests query by accessible name.
- **Models use legacy `Column(...)` style**, never `Mapped[]`/`mapped_column`, matching every existing model.
- **No `ForeignKey` on `user_id`.** No user FK exists anywhere in this schema; erasure is explicit in `app/services/user_data.py`.
- **JSON payloads are `Text` columns** written with `json.dumps` and read with `json.loads`. Never a `JSON`/`JSONB` column type. Column names end in `_json`.
- **Datetimes are naive**, `Column(DateTime, default=datetime.utcnow, nullable=False)`. Never `timezone=True`.
- **Backend tests:** `cd backend && python -m pytest tests/ -v`
- **Frontend tests:** `cd frontend && npm test`
- **Cap:** `SAVED_PROBLEMS_MAX_PER_USER = 200`
- **Pagination:** `SAVED_PROBLEMS_DEFAULT_LIMIT = 20`, `SAVED_PROBLEMS_MAX_LIMIT = 100`, clamped `max(1, min(int(limit), MAX))`
- **Sources:** exactly `"exercise"` and `"nvo"`
- **`source_ref` format:** exercise → `str(exercise_id)`; nvo → `f"{exam_id}:{question_number}"`
- **Ref key format** (client-side map key): `f"{source}:{source_ref}"`

---

### Task 1: Model, migration and registration

Creates the table and wires it into every registry that must know about it. Four separate pinning tests fail if any registration is skipped — including a GDPR one, where a missed entry means the table is never exported *or erased* on account deletion.

**Files:**
- Create: `backend/app/models/saved_problem.py`
- Create: `backend/alembic/versions/c9d0e1f2a3b4_saved_problems.py`
- Modify: `backend/alembic/env.py` (model import block, ~line 31-39)
- Modify: `backend/app/main.py` (model import block, ~line 29-36)
- Modify: `backend/tests/conftest.py:29-36` (`_schema` fixture imports)
- Modify: `backend/app/services/user_data.py:27-56` (import + `USER_OWNED_TABLES`)
- Modify: `backend/tests/test_user_data.py` (literal table-name set + `_populate`)

**Interfaces:**
- Consumes: nothing
- Produces: `app.models.saved_problem.SavedProblem` with columns `id: int`, `user_id: int`, `source: str`, `source_ref: str`, `snapshot_json: str`, `created_at: datetime`; unique constraint `uq_saved_problem_user_source_ref` on `(user_id, source, source_ref)`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_saved_problems.py`:

```python
"""Saved problems: a student's bookmarked practice exercises and NVO questions."""
import json

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.saved_problem import SavedProblem


@pytest.fixture(autouse=True)
def _clean_saved_problems(db):
    """Delete every row before and after each test.

    No user_id column in this schema carries a foreign key, so make_user's
    teardown leaves child rows behind. SQLite then reuses ids, and the
    (user_id, source, source_ref) unique constraint fires on a row belonging
    to a long-gone user from an earlier test.
    """
    db.query(SavedProblem).delete()
    db.commit()
    yield
    db.query(SavedProblem).delete()
    db.commit()


def test_stores_a_snapshot_and_reads_it_back(db, make_user):
    user = make_user()
    snapshot = {"kind": "exercise", "question": "Колко е 2 + 2?", "answer_type": "numeric"}
    db.add(
        SavedProblem(
            user_id=user.id,
            source="exercise",
            source_ref="4271",
            snapshot_json=json.dumps(snapshot, ensure_ascii=False),
        )
    )
    db.commit()

    row = db.query(SavedProblem).filter(SavedProblem.user_id == user.id).one()
    assert row.source == "exercise"
    assert row.source_ref == "4271"
    assert json.loads(row.snapshot_json)["question"] == "Колко е 2 + 2?"
    assert row.created_at is not None


def test_the_same_problem_cannot_be_saved_twice_by_one_user(db, make_user):
    user = make_user()
    for _ in range(2):
        db.add(
            SavedProblem(
                user_id=user.id, source="nvo", source_ref="exam-abc:7", snapshot_json="{}"
            )
        )
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_two_students_may_each_save_the_same_problem(db, make_user):
    first, second = make_user(), make_user()
    for user in (first, second):
        db.add(
            SavedProblem(
                user_id=user.id, source="nvo", source_ref="exam-abc:7", snapshot_json="{}"
            )
        )
    db.commit()
    assert db.query(SavedProblem).filter(SavedProblem.source_ref == "exam-abc:7").count() == 2
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && python -m pytest tests/test_saved_problems.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.models.saved_problem'`

- [ ] **Step 3: Create the model**

Create `backend/app/models/saved_problem.py`:

```python
"""Problems a student has bookmarked to come back to later.

The snapshot is the whole point. A practice exercise has a durable row id, but
an NVO question does not: its id is only the ordinal within a generated exam,
and that exam is evicted from the store after 24h. Saving a reference would
leave a dead entry exactly when the student wants to revisit it, so the full
question payload is copied in here at save time instead.

Both sources normalise onto one snapshot schema so the review page needs a
single renderer — see docs/superpowers/specs/2026-09-20-saved-problems-design.md.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String, Text, UniqueConstraint

from app.database import Base


class SavedProblem(Base):
    """One bookmarked problem. Real user data, no TTL."""

    __tablename__ = "saved_problems"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    # "exercise" | "nvo"
    source = Column(String(16), nullable=False)
    # Dedupe key: str(exercise_id), or f"{exam_id}:{question_number}".
    # A single non-null string rather than nullable typed columns, because SQL
    # treats NULLs as distinct and a composite key over them would silently
    # fail to dedupe.
    source_ref = Column(String(128), nullable=False)
    snapshot_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "source", "source_ref", name="uq_saved_problem_user_source_ref"
        ),
    )
```

- [ ] **Step 4: Register the model in the test schema fixture**

In `backend/tests/conftest.py`, inside `_schema()`, after the `import app.models.mobile_channel  # noqa: F401` line at :36, add:

```python
    import app.models.saved_problem  # noqa: F401
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && python -m pytest tests/test_saved_problems.py -v`
Expected: PASS (3 tests)

- [ ] **Step 6: Register the model for Alembic and the app**

In `backend/alembic/env.py`, in the model import block (~:31-39), add alongside the other `import app.models.<name>  # noqa` lines:

```python
import app.models.saved_problem  # noqa
```

In `backend/app/main.py`, in the model registration block (~:29-36), add:

```python
import app.models.saved_problem  # noqa: ensure models are registered
```

- [ ] **Step 7: Verify the env.py registration test passes**

Run: `cd backend && python -m pytest tests/test_migrations.py::test_alembic_env_imports_every_model_module -v`
Expected: PASS — this test fails for any file in `app/models/` that `env.py` does not import.

- [ ] **Step 8: Write the migration**

Create `backend/alembic/versions/c9d0e1f2a3b4_saved_problems.py`:

```python
"""saved_problems

Bookmarked practice exercises and NVO questions. Stores a full JSON snapshot
rather than a reference because NVO questions have no durable id and their
generated exam expires after 24h.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-09-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_problems",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("source_ref", sa.String(length=128), nullable=False),
        sa.Column("snapshot_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "user_id", "source", "source_ref", name="uq_saved_problem_user_source_ref"
        ),
    )
    op.create_index("ix_saved_problems_user_id", "saved_problems", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_saved_problems_user_id", table_name="saved_problems")
    op.drop_table("saved_problems")
```

Note: no `op.batch_alter_table`. Batch mode is required only for `alter_column`
on an existing table (the SQLite limitation that broke the chain in
`a1b2c3d4e5f6_guest_users.py`); a brand-new `create_table` needs none.

- [ ] **Step 9: Verify the whole migration chain still runs on SQLite**

Run: `cd backend && python -m pytest tests/test_migrations.py -v`
Expected: PASS — including `test_the_whole_chain_runs_on_a_fresh_database`, which
walks the real chain against a throwaway SQLite file in a subprocess.

- [ ] **Step 10: Register the table for GDPR export and erasure**

In `backend/app/services/user_data.py`, add the import next to the other model imports (~:27-40):

```python
from app.models.saved_problem import SavedProblem
```

and add `SavedProblem` as the last entry of `USER_OWNED_TABLES` (:47-56):

```python
USER_OWNED_TABLES = (
    ExerciseAttempt,
    UserProgress,
    LessonProgress,
    UserXpProfile,
    XpEvent,
    UserBadge,
    UserDailyMission,
    NvoAttempt,
    SavedProblem,
)
```

This is not optional bookkeeping: omitting it means saved problems are neither
included in a data export nor deleted when a student deletes their account.

- [ ] **Step 11: Update the test that pins the registry**

In `backend/tests/test_user_data.py`, add `"saved_problems"` to the literal set of
table names asserted by `test_every_user_owned_table_is_registered` (~:71-85), and
add a row to `_populate` (~:52-66) so the export and delete tests cover it:

```python
    db.add(
        SavedProblem(
            user_id=user.id,
            source="exercise",
            source_ref="4271",
            snapshot_json='{"kind": "exercise", "question": "test"}',
        )
    )
```

with the matching import at the top of the file:

```python
from app.models.saved_problem import SavedProblem
```

- [ ] **Step 12: Run the full backend suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS, no regressions. `test_user_data.py` and `test_migrations.py` in particular.

- [ ] **Step 13: Commit**

```bash
git add backend/app/models/saved_problem.py \
        backend/alembic/versions/c9d0e1f2a3b4_saved_problems.py \
        backend/alembic/env.py backend/app/main.py \
        backend/tests/conftest.py backend/tests/test_saved_problems.py \
        backend/app/services/user_data.py backend/tests/test_user_data.py
git commit -m "feat: add saved_problems table for bookmarked exercises and NVO questions"
```

---

### Task 2: Service layer

All business logic — validation, the cap, idempotent re-save, ownership-scoped delete. The router in Task 3 stays thin.

**Files:**
- Create: `backend/app/services/saved_problems.py`
- Modify: `backend/tests/test_saved_problems.py` (append service tests)

**Interfaces:**
- Consumes: `app.models.saved_problem.SavedProblem` from Task 1
- Produces:
  - `SAVED_PROBLEMS_MAX_PER_USER: int = 200`
  - `SAVED_PROBLEMS_DEFAULT_LIMIT: int = 20`
  - `SAVED_PROBLEMS_MAX_LIMIT: int = 100`
  - `save_problem(db, *, user_id: int, source: str, source_ref: str, snapshot: dict) -> tuple[SavedProblem, bool]` — returns `(row, created)`
  - `list_problems(db, *, user_id: int, limit: int, source: str | None = None) -> list[SavedProblem]`
  - `list_refs(db, *, user_id: int) -> dict[str, int]` — maps `"{source}:{source_ref}"` to row id
  - `delete_problem(db, *, user_id: int, saved_id: int) -> None`
  - `snapshot_of(row: SavedProblem) -> dict`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_saved_problems.py`:

```python
from fastapi import HTTPException

from app.services import saved_problems as svc


def _snapshot(question="Колко е 2 + 2?"):
    return {"kind": "exercise", "question": question, "answer_type": "numeric"}


def test_saving_returns_the_row_and_reports_it_as_created(db, make_user):
    user = make_user()
    row, created = svc.save_problem(
        db, user_id=user.id, source="exercise", source_ref="4271", snapshot=_snapshot()
    )
    assert created is True
    assert row.id is not None
    assert svc.snapshot_of(row)["question"] == "Колко е 2 + 2?"


def test_saving_the_same_problem_again_is_idempotent(db, make_user):
    user = make_user()
    first, created_first = svc.save_problem(
        db, user_id=user.id, source="exercise", source_ref="4271", snapshot=_snapshot()
    )
    second, created_second = svc.save_problem(
        db, user_id=user.id, source="exercise", source_ref="4271", snapshot=_snapshot("друго")
    )
    assert created_first is True
    assert created_second is False
    assert second.id == first.id
    assert db.query(SavedProblem).filter(SavedProblem.user_id == user.id).count() == 1


def test_rejects_an_unknown_source(db, make_user):
    user = make_user()
    with pytest.raises(HTTPException) as exc:
        svc.save_problem(
            db, user_id=user.id, source="homework", source_ref="1", snapshot=_snapshot()
        )
    assert exc.value.status_code == 400


def test_rejects_a_snapshot_without_a_question(db, make_user):
    user = make_user()
    with pytest.raises(HTTPException) as exc:
        svc.save_problem(
            db, user_id=user.id, source="exercise", source_ref="1", snapshot={"kind": "exercise"}
        )
    assert exc.value.status_code == 400


def test_rejects_a_save_past_the_cap(db, make_user):
    user = make_user()
    for index in range(svc.SAVED_PROBLEMS_MAX_PER_USER):
        db.add(
            SavedProblem(
                user_id=user.id,
                source="exercise",
                source_ref=str(index),
                snapshot_json="{}",
            )
        )
    db.commit()

    with pytest.raises(HTTPException) as exc:
        svc.save_problem(
            db, user_id=user.id, source="exercise", source_ref="over", snapshot=_snapshot()
        )
    assert exc.value.status_code == 409


def test_re_saving_at_the_cap_still_works(db, make_user):
    """The cap must not lock a student out of toggling something already saved."""
    user = make_user()
    for index in range(svc.SAVED_PROBLEMS_MAX_PER_USER):
        db.add(
            SavedProblem(
                user_id=user.id, source="exercise", source_ref=str(index), snapshot_json="{}"
            )
        )
    db.commit()

    row, created = svc.save_problem(
        db, user_id=user.id, source="exercise", source_ref="0", snapshot=_snapshot()
    )
    assert created is False
    assert row.source_ref == "0"


def test_lists_newest_first(db, make_user):
    user = make_user()
    for ref in ("1", "2", "3"):
        svc.save_problem(
            db, user_id=user.id, source="exercise", source_ref=ref, snapshot=_snapshot()
        )
    rows = svc.list_problems(db, user_id=user.id, limit=10)
    assert [row.source_ref for row in rows] == ["3", "2", "1"]


def test_filters_by_source(db, make_user):
    user = make_user()
    svc.save_problem(db, user_id=user.id, source="exercise", source_ref="1", snapshot=_snapshot())
    svc.save_problem(db, user_id=user.id, source="nvo", source_ref="e:7", snapshot=_snapshot())

    assert len(svc.list_problems(db, user_id=user.id, limit=10, source="nvo")) == 1
    assert len(svc.list_problems(db, user_id=user.id, limit=10)) == 2


def test_never_leaks_another_students_saved_problems(db, make_user):
    mine, theirs = make_user(), make_user()
    svc.save_problem(db, user_id=mine.id, source="exercise", source_ref="1", snapshot=_snapshot())
    svc.save_problem(db, user_id=theirs.id, source="exercise", source_ref="2", snapshot=_snapshot())

    rows = svc.list_problems(db, user_id=mine.id, limit=10)
    assert [row.source_ref for row in rows] == ["1"]
    assert svc.list_refs(db, user_id=mine.id) == {"exercise:1": rows[0].id}


def test_refs_map_ref_keys_to_row_ids(db, make_user):
    user = make_user()
    row, _ = svc.save_problem(
        db, user_id=user.id, source="nvo", source_ref="exam-abc:7", snapshot=_snapshot()
    )
    assert svc.list_refs(db, user_id=user.id) == {"nvo:exam-abc:7": row.id}


def test_deletes_own_saved_problem(db, make_user):
    user = make_user()
    row, _ = svc.save_problem(
        db, user_id=user.id, source="exercise", source_ref="1", snapshot=_snapshot()
    )
    svc.delete_problem(db, user_id=user.id, saved_id=row.id)
    assert db.query(SavedProblem).filter(SavedProblem.user_id == user.id).count() == 0


def test_deleting_someone_elses_saved_problem_is_a_404(db, make_user):
    mine, theirs = make_user(), make_user()
    row, _ = svc.save_problem(
        db, user_id=theirs.id, source="exercise", source_ref="1", snapshot=_snapshot()
    )
    with pytest.raises(HTTPException) as exc:
        svc.delete_problem(db, user_id=mine.id, saved_id=row.id)
    assert exc.value.status_code == 404
    assert db.query(SavedProblem).filter(SavedProblem.id == row.id).count() == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_saved_problems.py -v`
Expected: FAIL — `ImportError: cannot import name 'saved_problems' from 'app.services'`

- [ ] **Step 3: Write the service**

Create `backend/app/services/saved_problems.py`:

```python
"""Saving, listing and removing a student's bookmarked problems.

Ownership is enforced here rather than in the router: every function takes an
explicit user_id and scopes on it, and a row belonging to someone else is a 404
rather than a 403 so that ids cannot be probed.
"""
from __future__ import annotations

import json

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.saved_problem import SavedProblem

SAVED_PROBLEMS_MAX_PER_USER = 200
SAVED_PROBLEMS_DEFAULT_LIMIT = 20
SAVED_PROBLEMS_MAX_LIMIT = 100

VALID_SOURCES = ("exercise", "nvo")

_MAX_SOURCE_REF_LENGTH = 128


def ref_key(source: str, source_ref: str) -> str:
    """The key the frontend uses to look a saved problem up."""
    return f"{source}:{source_ref}"


def snapshot_of(row: SavedProblem) -> dict:
    """Parse a stored snapshot, tolerating a corrupted one rather than 500ing."""
    try:
        parsed = json.loads(row.snapshot_json)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _validate(source: str, source_ref: str, snapshot: dict) -> None:
    if source not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail="Непознат тип задача.")
    if not source_ref or len(source_ref) > _MAX_SOURCE_REF_LENGTH:
        raise HTTPException(status_code=400, detail="Невалиден идентификатор на задача.")
    if not isinstance(snapshot, dict):
        raise HTTPException(status_code=400, detail="Невалидни данни за задачата.")
    question = snapshot.get("question")
    if not isinstance(question, str) or not question.strip():
        raise HTTPException(status_code=400, detail="Задачата няма условие.")


def _find(db: Session, *, user_id: int, source: str, source_ref: str) -> SavedProblem | None:
    return (
        db.query(SavedProblem)
        .filter(
            SavedProblem.user_id == user_id,
            SavedProblem.source == source,
            SavedProblem.source_ref == source_ref,
        )
        .first()
    )


def save_problem(
    db: Session, *, user_id: int, source: str, source_ref: str, snapshot: dict
) -> tuple[SavedProblem, bool]:
    """Save one problem. Returns (row, created).

    Idempotent: re-saving something already saved returns the existing row with
    created=False instead of raising. The bookmark button is a toggle and
    double-clicks are routine, so a duplicate must not be an error.
    """
    _validate(source, source_ref, snapshot)

    existing = _find(db, user_id=user_id, source=source, source_ref=source_ref)
    if existing is not None:
        return existing, False

    # Checked only for genuinely new rows, so someone at the cap can still
    # toggle problems they already saved.
    total = db.query(SavedProblem).filter(SavedProblem.user_id == user_id).count()
    if total >= SAVED_PROBLEMS_MAX_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Достигна максимума от {SAVED_PROBLEMS_MAX_PER_USER} запазени задачи. "
                "Премахни някои, за да запазиш нови."
            ),
        )

    row = SavedProblem(
        user_id=user_id,
        source=source,
        source_ref=source_ref,
        snapshot_json=json.dumps(snapshot, ensure_ascii=False),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        # Two concurrent saves of the same problem raced past the _find above.
        db.rollback()
        raced = _find(db, user_id=user_id, source=source, source_ref=source_ref)
        if raced is None:
            raise
        return raced, False
    db.refresh(row)
    return row, True


def list_problems(
    db: Session, *, user_id: int, limit: int, source: str | None = None
) -> list[SavedProblem]:
    """SECURITY: always scoped on the caller's own user_id."""
    query = db.query(SavedProblem).filter(SavedProblem.user_id == user_id)
    if source:
        if source not in VALID_SOURCES:
            raise HTTPException(status_code=400, detail="Непознат тип задача.")
        query = query.filter(SavedProblem.source == source)
    safe_limit = max(1, min(int(limit), SAVED_PROBLEMS_MAX_LIMIT))
    return (
        query.order_by(SavedProblem.created_at.desc(), SavedProblem.id.desc())
        .limit(safe_limit)
        .all()
    )


def list_refs(db: Session, *, user_id: int) -> dict[str, int]:
    """Every saved problem the user owns, as ref key -> row id.

    Returns the id so that un-saving needs no second round trip: a bookmark
    button knows (source, source_ref) but DELETE is keyed by id.
    """
    rows = (
        db.query(SavedProblem.id, SavedProblem.source, SavedProblem.source_ref)
        .filter(SavedProblem.user_id == user_id)
        .all()
    )
    return {ref_key(row.source, row.source_ref): row.id for row in rows}


def delete_problem(db: Session, *, user_id: int, saved_id: int) -> None:
    """SECURITY: 404 rather than 403 for someone else's row, so ids cannot be probed."""
    row = (
        db.query(SavedProblem)
        .filter(SavedProblem.id == saved_id, SavedProblem.user_id == user_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Задачата не е намерена.")
    db.delete(row)
    db.commit()
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_saved_problems.py -v`
Expected: PASS (all tests, including the 3 from Task 1)

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/saved_problems.py backend/tests/test_saved_problems.py
git commit -m "feat: add saved problems service with cap and idempotent save"
```

---

### Task 3: API router

**Files:**
- Create: `backend/app/routers/saved_problems.py`
- Modify: `backend/app/main.py` (router import ~:26, `include_router` after :117)
- Modify: `backend/tests/test_route_auth_matrix.py:87-89` (`PERSONAL_DATA_ROUTES`)
- Modify: `backend/tests/test_saved_problems.py` (append endpoint tests)

**Interfaces:**
- Consumes: everything `app.services.saved_problems` produces in Task 2
- Produces: HTTP endpoints `POST /saved-problems`, `GET /saved-problems`, `GET /saved-problems/refs`, `DELETE /saved-problems/{saved_id}`; response shape `{id, source, source_ref, snapshot, created_at}` where `created_at` is an ISO-8601 string

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_saved_problems.py`:

```python
import itertools

from fastapi.testclient import TestClient

from app.main import app

_client = TestClient(app)
_ip_counter = itertools.count(1)


def _auth_headers() -> dict:
    """Mint a real session. The guest endpoint is per-IP capped, hence the counter.

    Copy the exact token field name from tests/test_classroom_endpoints.py:14-27
    rather than trusting "access_token" here — that file is the working precedent.
    """
    response = _client.post(
        "/auth/guest", headers={"X-Forwarded-For": f"203.0.113.{next(_ip_counter) % 250 + 1}"}
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_save_then_list_over_http():
    headers = _auth_headers()
    body = {
        "source": "exercise",
        "source_ref": "4271",
        "snapshot": {"kind": "exercise", "question": "Колко е 2 + 2?", "answer_type": "numeric"},
    }
    created = _client.post("/saved-problems", json=body, headers=headers)
    assert created.status_code == 201, created.text
    assert created.json()["snapshot"]["question"] == "Колко е 2 + 2?"

    again = _client.post("/saved-problems", json=body, headers=headers)
    assert again.status_code == 200
    assert again.json()["id"] == created.json()["id"]

    listing = _client.get("/saved-problems", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    refs = _client.get("/saved-problems/refs", headers=headers)
    assert refs.json()["refs"] == {"exercise:4271": created.json()["id"]}

    removed = _client.delete(f"/saved-problems/{created.json()['id']}", headers=headers)
    assert removed.status_code == 204
    assert _client.get("/saved-problems", headers=headers).json() == []


@pytest.mark.parametrize(
    "method,path",
    [
        ("post", "/saved-problems"),
        ("get", "/saved-problems"),
        ("get", "/saved-problems/refs"),
        ("delete", "/saved-problems/1"),
    ],
)
def test_requires_a_signed_in_user(method, path):
    response = getattr(_client, method)(path, json={} if method == "post" else None)
    assert response.status_code == 401


def test_limit_is_clamped():
    headers = _auth_headers()
    for ref in range(3):
        _client.post(
            "/saved-problems",
            json={
                "source": "exercise",
                "source_ref": str(ref),
                "snapshot": {"kind": "exercise", "question": "q", "answer_type": "numeric"},
            },
            headers=headers,
        )
    assert len(_client.get("/saved-problems?limit=0", headers=headers).json()) == 1
    assert len(_client.get("/saved-problems?limit=9999", headers=headers).json()) == 3
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_saved_problems.py -v -k "http or signed_in or clamped"`
Expected: FAIL — 404 on every `/saved-problems` path, since the router is not mounted.

- [ ] **Step 3: Write the router**

Create `backend/app/routers/saved_problems.py`:

```python
"""Endpoints for a student's bookmarked problems.

Thin over app.services.saved_problems: validation, the cap and ownership all
live in the service. Every route is scoped on the authenticated caller.
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.services import saved_problems as svc

router = APIRouter(prefix="/saved-problems", tags=["saved-problems"])


class SavedProblemCreate(BaseModel):
    source: str = Field(..., min_length=1, max_length=16)
    source_ref: str = Field(..., min_length=1, max_length=128)
    snapshot: dict


class SavedProblemOut(BaseModel):
    id: int
    source: str
    source_ref: str
    snapshot: dict
    created_at: str


class SavedRefsOut(BaseModel):
    refs: Dict[str, int]


def _to_out(row) -> SavedProblemOut:
    return SavedProblemOut(
        id=row.id,
        source=row.source,
        source_ref=row.source_ref,
        snapshot=svc.snapshot_of(row),
        created_at=row.created_at.isoformat(),
    )


@router.post("", response_model=SavedProblemOut, status_code=status.HTTP_201_CREATED)
async def create_saved_problem(
    payload: SavedProblemCreate,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a problem. Returns 200 instead of 201 when it was already saved."""
    row, created = svc.save_problem(
        db,
        user_id=current_user.id,
        source=payload.source,
        source_ref=payload.source_ref,
        snapshot=payload.snapshot,
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return _to_out(row)


@router.get("", response_model=List[SavedProblemOut])
async def list_saved_problems(
    limit: int = svc.SAVED_PROBLEMS_DEFAULT_LIMIT,
    source: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """SECURITY: scoped on current_user.id; never accepts a caller-supplied user id."""
    rows = svc.list_problems(db, user_id=current_user.id, limit=limit, source=source)
    return [_to_out(row) for row in rows]


@router.get("/refs", response_model=SavedRefsOut)
async def list_saved_refs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Ref key -> row id, so bookmark buttons can render their state from one call."""
    return SavedRefsOut(refs=svc.list_refs(db, user_id=current_user.id))


@router.delete("/{saved_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_saved_problem(
    saved_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    svc.delete_problem(db, user_id=current_user.id, saved_id=saved_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
```

- [ ] **Step 4: Mount the router**

In `backend/app/main.py`, next to the other aliased router import (~:26):

```python
from app.routers.saved_problems import router as saved_problems_router
```

and after the last `app.include_router(...)` line (~:117):

```python
app.include_router(saved_problems_router)
```

- [ ] **Step 5: Pin the routes in the auth matrix**

In `backend/tests/test_route_auth_matrix.py`, extend `PERSONAL_DATA_ROUTES` (~:87-89):

```python
PERSONAL_DATA_ROUTES = [
    ("GET", "/nvo/attempts"),
    ("POST", "/saved-problems"),
    ("GET", "/saved-problems"),
    ("GET", "/saved-problems/refs"),
    ("DELETE", "/saved-problems/{saved_id}"),
]
```

Use the FastAPI path template, not a concrete id. An empty route path plus the
prefix registers as `"/saved-problems"`, not `"/saved-problems/"`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_saved_problems.py tests/test_route_auth_matrix.py -v`
Expected: PASS

- [ ] **Step 7: Run the full backend suite**

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS, no regressions

- [ ] **Step 8: Commit**

```bash
git add backend/app/routers/saved_problems.py backend/app/main.py \
        backend/tests/test_route_auth_matrix.py backend/tests/test_saved_problems.py
git commit -m "feat: add /saved-problems endpoints"
```

---

### Task 4: Frontend API service and snapshot builders

Typed calls plus the two functions that turn a practice exercise or an NVO question into the normalized snapshot. Keeping the builders here — not in the components — is what makes the two save surfaces produce the same shape.

**Files:**
- Create: `frontend/src/services/savedProblems.ts`
- Create: `frontend/src/services/savedProblems.test.ts`

**Interfaces:**
- Consumes: the Task 3 endpoints; `apiClient` (default export of `frontend/src/services/api.ts`)
- Produces:
  - types `SavedProblemSource`, `SavedProblemSnapshot`, `SavedProblem`
  - `exerciseRef(exerciseId: number): string`
  - `nvoRef(examId: string, questionNumber: number): string`
  - `refKey(source: SavedProblemSource, sourceRef: string): string`
  - `listSavedProblems(params?: { limit?: number; source?: SavedProblemSource }): Promise<SavedProblem[]>`
  - `listSavedRefs(): Promise<Record<string, number>>`
  - `saveProblem(input: { source; source_ref; snapshot }): Promise<SavedProblem>`
  - `deleteSavedProblem(id: number): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/services/savedProblems.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { exerciseRef, nvoRef, refKey } from './savedProblems';

describe('saved problem reference keys', () => {
  it('builds an exercise ref from the durable row id', () => {
    expect(exerciseRef(4271)).toBe('4271');
  });

  it('builds an NVO ref from the exam id and question number', () => {
    expect(nvoRef('exam-abc', 7)).toBe('exam-abc:7');
  });

  it('namespaces a ref key by source so the two sources cannot collide', () => {
    expect(refKey('exercise', '4271')).toBe('exercise:4271');
    expect(refKey('nvo', 'exam-abc:7')).toBe('nvo:exam-abc:7');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- savedProblems`
Expected: FAIL — cannot resolve `./savedProblems`

- [ ] **Step 3: Write the service**

Create `frontend/src/services/savedProblems.ts`:

```ts
import apiClient from './api';

export type SavedProblemSource = 'exercise' | 'nvo';

export type SavedProblemAnswerType = 'multiple_choice' | 'numeric' | 'algebra' | 'open';

export interface SavedProblemOption {
  key: string;
  text: string;
}

export interface SavedProblemOrigin {
  // kind === 'exercise'
  lesson_id?: number;
  lesson_title?: string;
  difficulty?: string;
  // kind === 'nvo'
  exam_id?: string;
  question_number?: number;
  module?: number;
  topic?: string;
}

/**
 * One shape for both sources, so the review page needs a single renderer.
 * Everything but `question` is optional — a snapshot saved by an older build
 * must still render.
 */
export interface SavedProblemSnapshot {
  kind: SavedProblemSource;
  question: string;
  answer_type: SavedProblemAnswerType;
  options?: SavedProblemOption[] | null;
  correct_answer?: string | string[] | null;
  solution?: string | null;
  diagram?: { type: string; config: Record<string, unknown> } | null;
  user_answer?: string | null;
  origin: SavedProblemOrigin;
}

export interface SavedProblem {
  id: number;
  source: SavedProblemSource;
  source_ref: string;
  snapshot: SavedProblemSnapshot;
  created_at: string;
}

export function exerciseRef(exerciseId: number): string {
  return String(exerciseId);
}

export function nvoRef(examId: string, questionNumber: number): string {
  return `${examId}:${questionNumber}`;
}

export function refKey(source: SavedProblemSource, sourceRef: string): string {
  return `${source}:${sourceRef}`;
}

export async function listSavedProblems(params?: {
  limit?: number;
  source?: SavedProblemSource;
}): Promise<SavedProblem[]> {
  const response = await apiClient.get('/saved-problems', { params });
  return Array.isArray(response.data) ? response.data : [];
}

export async function listSavedRefs(): Promise<Record<string, number>> {
  const response = await apiClient.get('/saved-problems/refs');
  return response.data?.refs ?? {};
}

export async function saveProblem(input: {
  source: SavedProblemSource;
  source_ref: string;
  snapshot: SavedProblemSnapshot;
}): Promise<SavedProblem> {
  const response = await apiClient.post('/saved-problems', input);
  return response.data;
}

export async function deleteSavedProblem(id: number): Promise<void> {
  await apiClient.delete(`/saved-problems/${id}`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- savedProblems`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/savedProblems.ts frontend/src/services/savedProblems.test.ts
git commit -m "feat: add saved problems API client"
```

---

### Task 5: SavedProblemsContext

Shared state so bookmark buttons on the exercises page, the NVO exam page and the list page all agree on what is saved.

**Files:**
- Create: `frontend/src/context/SavedProblemsContext.tsx`
- Modify: `frontend/src/App.tsx` (add the provider to the context composition at ~:104-118)

**Interfaces:**
- Consumes: everything Task 4 produces; `useAuth` from `frontend/src/context/AuthContext.tsx`
- Produces: `SavedProblemsProvider` and `useSavedProblems(): SavedProblemsContextValue` where

```ts
interface SavedProblemsContextValue {
  isSaved: (source: SavedProblemSource, sourceRef: string) => boolean;
  toggle: (input: {
    source: SavedProblemSource;
    sourceRef: string;
    buildSnapshot: () => SavedProblemSnapshot;
  }) => Promise<void>;
  savedCount: number;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
}
```

- [ ] **Step 1: Write the context**

Create `frontend/src/context/SavedProblemsContext.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import {
  deleteSavedProblem,
  listSavedRefs,
  refKey,
  saveProblem,
  type SavedProblemSnapshot,
  type SavedProblemSource,
} from '../services/savedProblems';

interface ToggleInput {
  source: SavedProblemSource;
  sourceRef: string;
  buildSnapshot: () => SavedProblemSnapshot;
}

interface SavedProblemsContextValue {
  isSaved: (source: SavedProblemSource, sourceRef: string) => boolean;
  toggle: (input: ToggleInput) => Promise<void>;
  savedCount: number;
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;
}

const SavedProblemsContext = createContext<SavedProblemsContextValue | null>(null);

export const SavedProblemsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();
  // ref key -> saved row id. The id is what DELETE needs.
  const [refs, setRefs] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setRefs({});
      return;
    }
    try {
      setRefs(await listSavedRefs());
    } catch {
      // A failed refresh only means buttons show as unsaved; saving still works.
      setRefs({});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAuthenticated) {
        setRefs({});
        return;
      }
      try {
        const loaded = await listSavedRefs();
        if (!cancelled) setRefs(loaded);
      } catch {
        if (!cancelled) setRefs({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const isSaved = useCallback(
    (source: SavedProblemSource, sourceRef: string) => refKey(source, sourceRef) in refs,
    [refs]
  );

  const toggle = useCallback(
    async ({ source, sourceRef, buildSnapshot }: ToggleInput) => {
      const key = refKey(source, sourceRef);
      const existingId = refs[key];
      setError(null);

      if (existingId !== undefined) {
        // Optimistic: drop it immediately, restore if the request fails.
        setRefs((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        try {
          await deleteSavedProblem(existingId);
        } catch {
          setRefs((current) => ({ ...current, [key]: existingId }));
          setError('Неуспешно премахване. Опитай отново.');
        }
        return;
      }

      try {
        const saved = await saveProblem({
          source,
          source_ref: sourceRef,
          snapshot: buildSnapshot(),
        });
        setRefs((current) => ({ ...current, [key]: saved.id }));
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail;
        setError(
          status === 409 && typeof detail === 'string'
            ? detail
            : 'Неуспешно запазване. Опитай отново.'
        );
      }
    },
    [refs]
  );

  const value = useMemo<SavedProblemsContextValue>(
    () => ({
      isSaved,
      toggle,
      savedCount: Object.keys(refs).length,
      error,
      clearError: () => setError(null),
      refresh,
    }),
    [isSaved, toggle, refs, error, refresh]
  );

  return <SavedProblemsContext.Provider value={value}>{children}</SavedProblemsContext.Provider>;
};

export function useSavedProblems(): SavedProblemsContextValue {
  const context = useContext(SavedProblemsContext);
  if (!context) {
    throw new Error('useSavedProblems must be used within a SavedProblemsProvider');
  }
  return context;
}
```

- [ ] **Step 2: Add the provider to the app**

In `frontend/src/App.tsx`, find the context composition (~:104-118) and wrap the
existing tree with `<SavedProblemsProvider>` **inside** `AuthProvider`, since it
reads `useAuth`:

```tsx
import { SavedProblemsProvider } from './context/SavedProblemsContext';
```

- [ ] **Step 3: Verify the app still builds**

Run: `cd frontend && npm run build`
Expected: build succeeds with no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/context/SavedProblemsContext.tsx frontend/src/App.tsx
git commit -m "feat: add SavedProblemsContext for shared bookmark state"
```

---

### Task 6: SaveProblemButton

**Files:**
- Create: `frontend/src/components/SaveProblemButton.tsx`
- Create: `frontend/src/components/SaveProblemButton.test.tsx`

**Interfaces:**
- Consumes: `useSavedProblems` from Task 5; types from Task 4
- Produces: `SaveProblemButton` with props `{ source: SavedProblemSource; sourceRef: string; buildSnapshot: () => SavedProblemSnapshot; className?: string }`

`buildSnapshot` is a callback rather than a value so the snapshot is built at click
time and captures whatever the student has currently answered.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/SaveProblemButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const toggle = vi.fn();
const isSaved = vi.fn();

vi.mock('../context/SavedProblemsContext', () => ({
  useSavedProblems: () => ({
    isSaved,
    toggle,
    savedCount: 0,
    error: null,
    clearError: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import SaveProblemButton from './SaveProblemButton';

const snapshot = {
  kind: 'exercise' as const,
  question: 'Колко е 2 + 2?',
  answer_type: 'numeric' as const,
  origin: { lesson_id: 3 },
};

describe('SaveProblemButton', () => {
  beforeEach(() => {
    toggle.mockReset().mockResolvedValue(undefined);
    isSaved.mockReset().mockReturnValue(false);
  });

  it('offers to save when the problem is not saved yet', () => {
    render(
      <SaveProblemButton source="exercise" sourceRef="4271" buildSnapshot={() => snapshot} />
    );
    expect(screen.getByRole('button', { name: 'Запази задачата' })).toBeInTheDocument();
  });

  it('offers to remove when the problem is already saved', () => {
    isSaved.mockReturnValue(true);
    render(
      <SaveProblemButton source="exercise" sourceRef="4271" buildSnapshot={() => snapshot} />
    );
    expect(screen.getByRole('button', { name: 'Премахни от запазените' })).toBeInTheDocument();
  });

  it('toggles with the source and ref when clicked', async () => {
    render(
      <SaveProblemButton source="nvo" sourceRef="exam-abc:7" buildSnapshot={() => snapshot} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Запази задачата' }));
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(toggle.mock.calls[0][0]).toMatchObject({ source: 'nvo', sourceRef: 'exam-abc:7' });
  });

  it('does not build the snapshot until the button is clicked', async () => {
    const buildSnapshot = vi.fn(() => snapshot);
    render(<SaveProblemButton source="exercise" sourceRef="1" buildSnapshot={buildSnapshot} />);
    expect(buildSnapshot).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Запази задачата' }));
    expect(toggle.mock.calls[0][0].buildSnapshot).toBe(buildSnapshot);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- SaveProblemButton`
Expected: FAIL — cannot resolve `./SaveProblemButton`

- [ ] **Step 3: Write the component**

Create `frontend/src/components/SaveProblemButton.tsx`:

```tsx
import React, { useState } from 'react';
import { useSavedProblems } from '../context/SavedProblemsContext';
import type { SavedProblemSnapshot, SavedProblemSource } from '../services/savedProblems';

interface SaveProblemButtonProps {
  source: SavedProblemSource;
  sourceRef: string;
  /** Called at click time so the snapshot captures the student's current answer. */
  buildSnapshot: () => SavedProblemSnapshot;
  className?: string;
}

const SaveProblemButton: React.FC<SaveProblemButtonProps> = ({
  source,
  sourceRef,
  buildSnapshot,
  className = '',
}) => {
  const { isSaved, toggle } = useSavedProblems();
  const [busy, setBusy] = useState(false);
  const saved = isSaved(source, sourceRef);
  const label = saved ? 'Премахни от запазените' : 'Запази задачата';

  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await toggle({ source, sourceRef, buildSnapshot });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={label}
      aria-pressed={saved}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${
        saved
          ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
          : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
      } ${className}`}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
};

export default SaveProblemButton;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- SaveProblemButton`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SaveProblemButton.tsx frontend/src/components/SaveProblemButton.test.tsx
git commit -m "feat: add SaveProblemButton bookmark toggle"
```

---

### Task 7: Wire the two save surfaces

Both slots already exist in the markup and need no layout change.

**Files:**
- Modify: `frontend/src/pages/ExercisesPage.tsx` (card header row, ~:270-296)
- Modify: `frontend/src/pages/NVOPracticeExamPage.tsx` (question header cluster, ~:1720-1739)

**Interfaces:**
- Consumes: `SaveProblemButton` from Task 6; `exerciseRef`, `nvoRef` and `SavedProblemSnapshot` from Task 4
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the button to the practice exercise card**

In `frontend/src/pages/ExercisesPage.tsx`, add the imports:

```tsx
import SaveProblemButton from '../components/SaveProblemButton';
import { exerciseRef, type SavedProblemSnapshot } from '../services/savedProblems';
```

The card header row at ~:270 is `flex items-center justify-between` with a left
group of badges and an empty right side. Insert immediately after the closing
`</div>` of that left group (~:295), before the row's own closing `</div>`:

```tsx
<SaveProblemButton
  source="exercise"
  sourceRef={exerciseRef(state.exercise.id)}
  buildSnapshot={(): SavedProblemSnapshot => ({
    kind: 'exercise',
    question: state.exercise.question,
    answer_type: state.exercise.exercise_type === 'multiple_choice'
      ? 'multiple_choice'
      : state.exercise.exercise_type === 'algebra'
        ? 'algebra'
        : 'numeric',
    options: null,
    correct_answer: state.submission?.correct_answer ?? null,
    solution: state.submission?.explanation ?? null,
    diagram: null,
    user_answer: state.userAnswer || null,
    origin: {
      lesson_id: state.exercise.lesson_id,
      difficulty: state.exercise.difficulty,
    },
  })}
/>
```

Check the actual field names on `ExerciseSubmissionResponse` in
`frontend/src/services/curriculum.ts` before writing `correct_answer` /
`explanation`; use whatever that interface actually declares, and pass `null` for
anything it does not carry.

- [ ] **Step 2: Add the button to the NVO question card**

In `frontend/src/pages/NVOPracticeExamPage.tsx`, add the imports:

```tsx
import SaveProblemButton from '../components/SaveProblemButton';
import { nvoRef, type SavedProblemSnapshot } from '../services/savedProblems';
```

The question header's right-hand cluster at ~:1727-1738 already holds the
"Маркирай за преглед" toggle. Wrap that toggle and the new button in a
`<div className="flex shrink-0 items-center gap-2">` and add:

```tsx
{examId && (
  <SaveProblemButton
    source="nvo"
    sourceRef={nvoRef(examId, current.id)}
    buildSnapshot={(): SavedProblemSnapshot => ({
      kind: 'nvo',
      question: current.text,
      answer_type: current.type === 'mcq' ? 'multiple_choice' : 'open',
      options: current.type === 'mcq' ? current.options : null,
      correct_answer: current.correctAnswer ?? null,
      solution: null,
      diagram: current.hasDiagram && current.diagramType
        ? { type: current.diagramType, config: current.diagramConfig ?? {} }
        : null,
      user_answer: answers[current.id] ?? null,
      origin: {
        exam_id: examId,
        question_number: current.id,
        module: current.module,
        topic: current.topic,
      },
    })}
  />
)}
```

The `examId &&` guard matters: without a server-issued exam id there is no stable
ref, so the button must not render.

- [ ] **Step 3: Verify the build and full frontend suite**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ExercisesPage.tsx frontend/src/pages/NVOPracticeExamPage.tsx
git commit -m "feat: add bookmark buttons to practice exercises and NVO questions"
```

---

### Task 8: Saved problems page, route and navigation

**Files:**
- Create: `frontend/src/pages/SavedProblemsPage.tsx`
- Create: `frontend/src/pages/SavedProblemsPage.test.tsx`
- Create: `frontend/src/utils/datetime.ts`
- Modify: `frontend/src/pages/NVOPracticeExamPage.tsx` (~:126-136, use the lifted formatter)
- Modify: `frontend/src/App.tsx` (lazy import + route inside `RequireAuth`)
- Modify: `frontend/src/components/AppNavbar.tsx:69-74` (`NAV_ITEMS`)
- Modify: `frontend/src/components/ChatSidebar.tsx` (`shortcutItems`)

**Interfaces:**
- Consumes: `listSavedProblems`, `deleteSavedProblem`, `SavedProblem` from Task 4; `useSavedProblems` from Task 5
- Produces: `formatBgDateTime(value: string | Date): string` in `frontend/src/utils/datetime.ts`; route `/saved`

- [ ] **Step 1: Lift the date formatter**

Create `frontend/src/utils/datetime.ts`:

```ts
/** Bulgarian date and time, e.g. "20.09.2026 г., 14:05". */
export function formatBgDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('bg-BG', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
```

Then in `frontend/src/pages/NVOPracticeExamPage.tsx`, delete the module-private
`formatBgDateTime` (~:126-136) and import this one instead, so there is one
implementation.

- [ ] **Step 2: Write the failing page test**

Create `frontend/src/pages/SavedProblemsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const listSavedProblems = vi.fn();
const deleteSavedProblem = vi.fn();

vi.mock('../services/savedProblems', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/savedProblems')>();
  return {
    ...actual,
    listSavedProblems: (...args: unknown[]) => listSavedProblems(...args),
    deleteSavedProblem: (...args: unknown[]) => deleteSavedProblem(...args),
  };
});

vi.mock('../context/SavedProblemsContext', () => ({
  useSavedProblems: () => ({
    isSaved: () => true,
    toggle: vi.fn(),
    savedCount: 1,
    error: null,
    clearError: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('../components/AppNavbar', () => ({ default: () => null }));

import SavedProblemsPage from './SavedProblemsPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <SavedProblemsPage />
    </MemoryRouter>
  );

describe('SavedProblemsPage', () => {
  beforeEach(() => {
    listSavedProblems.mockReset().mockResolvedValue([]);
    deleteSavedProblem.mockReset().mockResolvedValue(undefined);
  });

  it('tells the student when nothing is saved yet', async () => {
    renderPage();
    expect(await screen.findByText('Няма запазени задачи.')).toBeInTheDocument();
  });

  it('shows a saved problem with its origin and date', async () => {
    listSavedProblems.mockResolvedValue([
      {
        id: 1,
        source: 'nvo',
        source_ref: 'exam-abc:7',
        created_at: '2026-09-20T14:05:00',
        snapshot: {
          kind: 'nvo',
          question: 'Колко е 2 + 2?',
          answer_type: 'multiple_choice',
          origin: { exam_id: 'exam-abc', question_number: 7 },
        },
      },
    ]);
    renderPage();
    expect(await screen.findByText('Колко е 2 + 2?')).toBeInTheDocument();
    expect(screen.getByText(/От НВО тест/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npm test -- SavedProblemsPage`
Expected: FAIL — cannot resolve `./SavedProblemsPage`

- [ ] **Step 4: Write the page**

Create `frontend/src/pages/SavedProblemsPage.tsx`. Build it on `PageShell`,
`PageHeader` and `EmptyState` from `frontend/src/components/app/PageShell.tsx`
with design tokens (`bg-surface`, `text-ink`, `border-line`), mirroring the
information architecture of the NVO history list
(`NVOPracticeExamPage.tsx:1486-1543`): a title row, a meta line, and an action row.

Start from this skeleton — it fixes the data flow, the filter state and the exact
Bulgarian strings. Fill in the card body and the review panel against the behaviour
list below it, reading `PageShell.tsx` for the real prop signatures of `PageShell`,
`PageHeader` and `EmptyState` before wiring them up.

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import AppNavbar from '../components/AppNavbar';
import { useSavedProblems } from '../context/SavedProblemsContext';
import {
  deleteSavedProblem,
  listSavedProblems,
  type SavedProblem,
  type SavedProblemSource,
} from '../services/savedProblems';
import { formatBgDateTime } from '../utils/datetime';

type Filter = 'all' | SavedProblemSource;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Всички' },
  { value: 'exercise', label: 'От упражнения' },
  { value: 'nvo', label: 'От НВО' },
];

function originLine(item: SavedProblem): string {
  const origin = item.snapshot.origin ?? {};
  if (item.snapshot.kind === 'nvo') {
    return `От НВО тест • Задача ${origin.question_number ?? '?'}`;
  }
  return origin.lesson_title
    ? `От урок ${origin.lesson_title}`
    : `От урок ${origin.lesson_id ?? ''}`.trim();
}

const SavedProblemsPage: React.FC = () => {
  const { refresh } = useSavedProblems();
  const [items, setItems] = useState<SavedProblem[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const loaded = await listSavedProblems(
          filter === 'all' ? { limit: 100 } : { limit: 100, source: filter }
        );
        if (!cancelled) setItems(loaded);
      } catch {
        if (!cancelled) setError('Грешка при зареждане на запазените задачи');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter]);

  const remove = useCallback(
    async (id: number) => {
      try {
        await deleteSavedProblem(id);
        setItems((current) => current.filter((item) => item.id !== id));
        await refresh();
      } catch {
        setError('Неуспешно премахване. Опитай отново.');
      }
    },
    [refresh]
  );

  return (
    <>
      <AppNavbar backTo="/dashboard" />
      {/* PageShell + PageHeader title "Запазени задачи" */}
      {/* filter chips from FILTERS, driving setFilter */}
      {/* loading skeleton; error via ErrorState */}
      {/* items.length === 0 -> "Няма запазени задачи." */}
      {/* one card per item: question preview, originLine(item),
          formatBgDateTime(item.created_at), "Отвори задачата" toggling openId,
          "Премахни" calling remove(item.id) */}
    </>
  );
};

export default SavedProblemsPage;
```

Required behaviour for the parts left as comments:

- `useState` + `useEffect` + `listSavedProblems()` with `loading` / `error` state and
  a `cancelled` flag in the cleanup, matching `LearnGradesPage.tsx:26-46`.
- Filter chips `Всички` / `От упражнения` / `От НВО` driving a `source` filter; refetch
  on change.
- Each card shows: the question text (the preview), an origin line, the saved date via
  `formatBgDateTime(item.created_at)`, an expand control `Отвори задачата` revealing
  the read-only review, and `Премахни` which calls `deleteSavedProblem(item.id)` then
  drops the row from local state and calls `refresh()` from the context so bookmark
  buttons elsewhere update.
- The read-only review renders: the question, the options when `answer_type` is
  `multiple_choice`, `Твоят отговор` when `user_answer` is set, `Верен отговор` when
  `correct_answer` is set, and the solution when `solution` is set. Every one of those
  is optional — render nothing for a field the snapshot lacks.
- Origin line: `От урок` plus `origin.lesson_title` when present (falling back to
  `origin.lesson_id`) for `kind === 'exercise'`; `От НВО тест • Задача {origin.question_number}`
  for `kind === 'nvo'`.
- Empty state text exactly `Няма запазени задачи.`
- Render `<AppNavbar />` at the top like every other page.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npm test -- SavedProblemsPage`
Expected: PASS (2 tests)

- [ ] **Step 6: Add the route**

In `frontend/src/App.tsx`, add the lazy import beside the others (~:13-35):

```tsx
const SavedProblemsPage = lazy(() => import('./pages/SavedProblemsPage'));
```

and the route inside the `<Route element={<RequireAuth />}>` block (~:70-87),
relative with no leading slash like its siblings:

```tsx
<Route path="saved" element={<SavedProblemsPage />} />
```

- [ ] **Step 7: Add the navigation entries**

In `frontend/src/components/AppNavbar.tsx`, add to `NAV_ITEMS` (~:69-74), importing
`BookmarkSimple` from `@phosphor-icons/react` alongside the existing icons:

```tsx
{ label: 'Запазени задачи', path: '/saved', Icon: BookmarkSimple, exact: false },
```

In `frontend/src/components/ChatSidebar.tsx`, add an entry to `shortcutItems`
(~:102) **outside** the path-based branches so it appears on every route — this is
the "Saved Problems button in the right-side bottom popup" the backlog asks for:

```tsx
{ label: '🔖 Запазени задачи', tone: NAV_TONE, run: () => { navigate('/saved'); onClose(); } },
```

`tone` is a Tailwind class string. Read the existing navigation shortcuts in that
same `shortcutItems` array — `'📚 Към уроците'` and `'✏️ Към упражненията'` — and reuse
the exact tone string one of them uses, so this entry matches its neighbours rather
than introducing a new colour.

- [ ] **Step 8: Verify the build and full suites**

Run: `cd frontend && npm run build && npm test`
Expected: build succeeds, all frontend tests pass

Run: `cd backend && python -m pytest tests/ -v`
Expected: PASS

- [ ] **Step 9: Update the backlog docs**

In `REMAINING_FEATURES.md`, change §1 from "❌ Not started" to done with the date,
and update the priority-order list so Saved Problems is no longer item 3.
In `PRODUCTION_ROADMAP.md` §6, make the matching edit.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/SavedProblemsPage.tsx frontend/src/pages/SavedProblemsPage.test.tsx \
        frontend/src/utils/datetime.ts frontend/src/pages/NVOPracticeExamPage.tsx \
        frontend/src/App.tsx frontend/src/components/AppNavbar.tsx \
        frontend/src/components/ChatSidebar.tsx \
        REMAINING_FEATURES.md PRODUCTION_ROADMAP.md
git commit -m "feat: add saved problems page, route and navigation"
```

---

## Manual QA before calling this done

The automated tests do not cover the real browser flow. Start the app and check:

1. Open a lesson's exercises, bookmark one, reload the page — the button is still filled.
2. Open `/saved` — the exercise is listed with its lesson origin and today's date.
3. Start an NVO exam, answer a question, bookmark it, submit the exam.
4. Wait for or force the exam's 24h eviction, then open `/saved` — the NVO question
   still renders in full. This is the whole reason for snapshotting; if it fails here,
   the feature does not work.
5. Un-save from `/saved`, return to the exercises page — the button is unfilled.
6. Sign in as a guest and confirm saving works.
