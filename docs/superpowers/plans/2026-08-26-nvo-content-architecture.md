# NVO Content Architecture (Phases 0-4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the file-based NVO reference corpus (`nvo_question_catalog.json` + `reference_nvo_full_exam_*.txt`) with a Postgres-backed, queryable problem corpus, wired into NVO exam generation behind a feature flag, with metadata-filter retrieval (Phase 0-3) and embedding-based hybrid ranking (Phase 4) — while the existing file-based generation keeps working as an automatic fallback at every step.

**Architecture:** Add a `nvo_` -prefixed schema (source exams, topics, skills, problems, problem-skills, generation-run audit log, problem embeddings) alongside the existing curriculum schema. A new retrieval service reads this schema with deterministic metadata filters, then (Phase 4) reranks by cosine similarity over cached embeddings plus a lexical-diversity dedup pass. `app/routers/nvo.py`'s two generators (`_fallback_generate_from_pool`, `_generate_via_openai`) gain a single new read path, `_load_catalog_or_db()`, that returns DB-shaped content when the flag is on and the corpus is complete for all 23 slots, and transparently falls back to the current file catalog otherwise — so this ships and can be toggled without ever risking a broken `/nvo/generate`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (Column-style, matching `app/models/nvo_exam.py`), Alembic, SQLite (tests) / PostgreSQL (prod, via `psycopg2-binary` already in `requirements.txt`), OpenAI `embeddings.create` (`openai==1.54.4`, already installed), pytest.

**Spec:** `NVO_CONTENT_ARCHITECTURE_PLAN.md` (repo root) — this plan implements its Phase 0 through Phase 4 (`## Migration strategy from current system`).

## Global Constraints

- New tables are prefixed `nvo_` (`nvo_source_exams`, `nvo_topics`, `nvo_skills`, `nvo_problems`, `nvo_problem_skills`, `nvo_generation_runs`, `nvo_problem_embeddings`) — the spec's literal names (`topics`, `problems`, ...) collide with the existing practice-curriculum tables in `app/models/curriculum.py`.
- No pgvector / Postgres-only feature. `backend/tests/conftest.py` runs the entire suite against a throwaway SQLite file regardless of `DATABASE_URL` (see its module docstring) — any Postgres-only column type would be untestable. Embeddings are stored as JSON text; similarity is computed in pure Python. Revisit only if the corpus grows past a few thousand rows.
- Every DB-backed read path must fail safe to the existing file-based catalog (`app/routers/nvo.py:load_nvo_catalog`) — a missing corpus, a partial corpus (any of the 23 slots empty), or any exception must never break `/nvo/generate` or `/nvo/generate-job`.
- Two feature flags, both defaulting to `False`: `NVO_USE_DB_RETRIEVAL` (Phase 1/3) and `NVO_USE_EMBEDDING_RETRIEVAL` (Phase 4, only meaningful when the first is also `True`). This ships dark; an operator opts in only after running the Phase 2 backfill and Phase 4 embedding backfill.
- Background-job code (`_run_generation_job`, invoked via `loop.run_in_executor`) has no request-scoped DB session. New services open and close their own `SessionLocal()`, mirroring the existing pattern in `app/services/nvo_exam_store.py`.
- All new model classes use the Column-based SQLAlchemy style already used in `app/models/nvo_exam.py`, not `Mapped[]` typed columns.
- Every new model module must be added to `alembic/env.py`'s import list — `backend/tests/test_migrations.py::test_alembic_env_imports_every_model_module` enforces this automatically and will fail the suite otherwise.
- New model modules must also be imported in `backend/tests/conftest.py`'s `_schema` fixture, or their tables never get created for the test database.
- Admin-only new endpoints use `Depends(require_admin)`, matching `app/routers/nvo.py`'s existing `/admin/reset-all-xp`.
- The spec's "Suggested API surface" lists 6 endpoints; this plan implements 2 (`GET /nvo/generation-runs/{id}`, `GET /nvo/retrieval/preview`) because the backfill and embedding-backfill CLIs cover ingestion/embedding needs today, and `/nvo/generate` is already the generation entrypoint. The other 4 (`/content/sources/import`, `/content/problems/search`, `/content/problems/embeddings/rebuild`, `/nvo/generate-from-retrieval`) are deferred — add as thin wrappers around the CLI functions later if an admin UI needs them.
- The Phase 2 backfill (Task 3) only parses `nvo_question_catalog.json` (23 slots x ~5 variants each, already structured). It does **not** parse the free-text `reference_nvo_full_exam_*.txt` transcripts into individual problems — that requires the "step B: parsing" segmentation work the spec calls out separately under "Ingestion pipeline design," which is a distinct, much larger effort (detect problem boundaries/type/options from raw exam text) out of scope for Phases 0-4 as implemented here. Those transcripts continue to be picked up as-is by the existing file-based fallback path (`load_nvo_questions()`), which is untouched by this plan.
- `NvoGenerationRun.selected_problem_ids_json` (Task 5) is defined per spec but is **not populated** by Task 6/9's wiring — recording exact selected problem IDs would require threading IDs through the existing slot-selection loops in `_fallback_generate_from_pool`/`_generate_via_openai`, which pick from catalog-shaped variant dicts, not `NvoProblem` rows directly. The audit row still records `source` (`db`/`file_catalog`) and `model`, which is enough to know whether a given exam came from the DB corpus. Populating exact problem IDs is a reasonable follow-up once this ships, not included here.

---

## Task 1: NVO content schema — models + migration (Phase 0)

**Files:**
- Create: `backend/app/models/nvo_content.py`
- Modify: `backend/alembic/env.py`
- Modify: `backend/tests/conftest.py`
- Create: `backend/alembic/versions/b2c3d4e5f6a1_nvo_content_schema.py`
- Test: `backend/tests/test_nvo_content_models.py`

**Interfaces:**
- Produces: `NvoSourceExam`, `NvoTopic` (with `.code`, `.name`, `.notes`, `.grade`), `NvoSkill`, `NvoProblem` (with `.topic_id`, `.external_ref`, `.slot_number`, `.answer_format`, `.statement`, `.options_json`, `.correct_answer_json`, `.open_parts_json`, `.difficulty`, `.quality_score`, `.is_active`), `NvoProblemSkill` — all SQLAlchemy `Base` subclasses in `app.models.nvo_content`, used by every later task.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_nvo_content_models.py
import json

import pytest
from sqlalchemy import inspect

from app.models.nvo_content import (
    NvoProblem,
    NvoProblemSkill,
    NvoSkill,
    NvoSourceExam,
    NvoTopic,
)


def test_tables_are_created(db):
    inspector = inspect(db.get_bind())
    tables = set(inspector.get_table_names())
    assert {
        "nvo_source_exams",
        "nvo_topics",
        "nvo_skills",
        "nvo_problems",
        "nvo_problem_skills",
    } <= tables


def test_problem_round_trip(db):
    source = NvoSourceExam(title="2024 official exam", year=2024, variant="v1")
    topic = NvoTopic(code="arithmetic_expression_evaluation", name="Arithmetic expressions")
    db.add_all([source, topic])
    db.flush()

    problem = NvoProblem(
        source_exam_id=source.id,
        topic_id=topic.id,
        external_ref="2024_v1",
        slot_number=1,
        answer_format="mcq",
        statement="Стойността на израза ... е:",
        options_json=json.dumps(["А) 1", "Б) 2", "В) 3", "Г) 4"], ensure_ascii=False),
        correct_answer_json=json.dumps("В", ensure_ascii=False),
        difficulty="easy",
    )
    db.add(problem)
    db.commit()

    fetched = db.query(NvoProblem).filter_by(external_ref="2024_v1", slot_number=1).one()
    assert fetched.topic_id == topic.id
    assert fetched.is_active is True
    assert fetched.quality_score == 1.0
    assert fetched.content_version == 1


def test_slot_and_external_ref_must_be_unique_together(db):
    topic = NvoTopic(code="dup_topic", name="Dup")
    db.add(topic)
    db.flush()

    db.add(NvoProblem(
        topic_id=topic.id, external_ref="2024_v1", slot_number=1,
        answer_format="mcq", statement="a", correct_answer_json=json.dumps("А"),
    ))
    db.commit()

    db.add(NvoProblem(
        topic_id=topic.id, external_ref="2024_v1", slot_number=1,
        answer_format="mcq", statement="b", correct_answer_json=json.dumps("Б"),
    ))
    with pytest.raises(Exception):
        db.commit()
    db.rollback()


def test_problem_skill_join_round_trip(db):
    topic = NvoTopic(code="t", name="T")
    db.add(topic)
    db.flush()
    problem = NvoProblem(
        topic_id=topic.id, external_ref="r", slot_number=1,
        answer_format="mcq", statement="s", correct_answer_json=json.dumps("А"),
    )
    skill = NvoSkill(code="skill-1", name="Skill 1")
    db.add_all([problem, skill])
    db.flush()

    db.add(NvoProblemSkill(problem_id=problem.id, skill_id=skill.id, weight=0.7))
    db.commit()

    link = db.query(NvoProblemSkill).one()
    assert link.problem_id == problem.id
    assert link.weight == 0.7
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_content_models.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.models.nvo_content'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/models/nvo_content.py
"""Structured NVO problem corpus — source exams, taxonomy, and problem rows.

Implements NVO_CONTENT_ARCHITECTURE_PLAN.md Phase 0. Prefixed `nvo_` because
`topics`/`grades` already name the practice-curriculum tables in
app.models.curriculum; this is a separate taxonomy for the NVO
exam-generation corpus, not the same rows.
"""
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from app.database import Base


class NvoSourceExam(Base):
    """Provenance record for one official/synthetic/curated NVO exam document."""

    __tablename__ = "nvo_source_exams"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    year = Column(Integer, nullable=True)
    variant = Column(String(32), nullable=True)
    source_type = Column(String(32), nullable=False, default="official")
    language = Column(String(8), nullable=False, default="bg")
    raw_text = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class NvoTopic(Base):
    """A slot topic in the NVO taxonomy (e.g. arithmetic_expression_evaluation)."""

    __tablename__ = "nvo_topics"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(128), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    notes = Column(Text, nullable=True)
    grade = Column(Integer, nullable=False, default=7)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class NvoSkill(Base):
    """A fine-grained skill tag (many-to-many with problems via NvoProblemSkill).

    Not populated by the Phase 2 backfill — the current catalog has no skill
    data. Table exists so the taxonomy is ready when a skill-tagging pass
    (manual or model-assisted) is added later.
    """

    __tablename__ = "nvo_skills"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(128), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)


class NvoProblem(Base):
    """One retrievable NVO problem: a specific variant at a specific template slot."""

    __tablename__ = "nvo_problems"
    __table_args__ = (
        UniqueConstraint("slot_number", "external_ref", name="uq_nvo_problem_slot_ref"),
    )

    id = Column(Integer, primary_key=True, index=True)
    source_exam_id = Column(Integer, ForeignKey("nvo_source_exams.id"), nullable=True)
    topic_id = Column(Integer, ForeignKey("nvo_topics.id"), nullable=False, index=True)
    external_ref = Column(String(64), nullable=False)
    slot_number = Column(Integer, nullable=False, index=True)
    answer_format = Column(String(16), nullable=False)  # 'mcq' | 'open'
    statement = Column(Text, nullable=False)
    options_json = Column(Text, nullable=True)
    correct_answer_json = Column(Text, nullable=False)
    open_parts_json = Column(Text, nullable=True)
    difficulty = Column(String(16), nullable=False, default="medium")
    quality_score = Column(Float, nullable=False, default=1.0)
    is_active = Column(Boolean, nullable=False, default=True)
    content_version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class NvoProblemSkill(Base):
    """Many-to-many join between nvo_problems and nvo_skills."""

    __tablename__ = "nvo_problem_skills"

    problem_id = Column(Integer, ForeignKey("nvo_problems.id"), primary_key=True)
    skill_id = Column(Integer, ForeignKey("nvo_skills.id"), primary_key=True)
    weight = Column(Float, nullable=False, default=1.0)
```

Modify `backend/tests/conftest.py` — in the `_schema` fixture, add the new import alongside the existing model imports:

```python
    import app.models.curriculum  # noqa: F401
    import app.models.progress  # noqa: F401
    import app.models.companion  # noqa: F401
    import app.models.nvo_exam  # noqa: F401
    import app.models.nvo_content  # noqa: F401
```

Modify `backend/alembic/env.py` — add the import next to the other model imports:

```python
import app.models.curriculum  # noqa
import app.models.progress    # noqa
import app.models.user        # noqa
import app.models.companion   # noqa
import app.models.nvo_exam    # noqa
import app.models.nvo_content # noqa
```

Create the migration:

```python
# backend/alembic/versions/b2c3d4e5f6a1_nvo_content_schema.py
"""nvo content schema

Adds the structured NVO problem corpus described in
NVO_CONTENT_ARCHITECTURE_PLAN.md Phase 0: source exams, topic taxonomy,
skills taxonomy, the problems table itself, and their join table.

Prefixed `nvo_` — `topics` already names the practice-curriculum table in
app.models.curriculum; this is a separate taxonomy for the NVO
exam-generation corpus.

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-08-26 00:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "b2c3d4e5f6a1"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nvo_source_exams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("variant", sa.String(length=32), nullable=True),
        sa.Column("source_type", sa.String(length=32), nullable=False, server_default="official"),
        sa.Column("language", sa.String(length=8), nullable=False, server_default="bg"),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "nvo_topics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("grade", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_nvo_topics_code", "nvo_topics", ["code"], unique=True)

    op.create_table(
        "nvo_skills",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
    )
    op.create_index("ix_nvo_skills_code", "nvo_skills", ["code"], unique=True)

    op.create_table(
        "nvo_problems",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_exam_id", sa.Integer(), sa.ForeignKey("nvo_source_exams.id"), nullable=True),
        sa.Column("topic_id", sa.Integer(), sa.ForeignKey("nvo_topics.id"), nullable=False),
        sa.Column("external_ref", sa.String(length=64), nullable=False),
        sa.Column("slot_number", sa.Integer(), nullable=False),
        sa.Column("answer_format", sa.String(length=16), nullable=False),
        sa.Column("statement", sa.Text(), nullable=False),
        sa.Column("options_json", sa.Text(), nullable=True),
        sa.Column("correct_answer_json", sa.Text(), nullable=False),
        sa.Column("open_parts_json", sa.Text(), nullable=True),
        sa.Column("difficulty", sa.String(length=16), nullable=False, server_default="medium"),
        sa.Column("quality_score", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("content_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("slot_number", "external_ref", name="uq_nvo_problem_slot_ref"),
    )
    op.create_index("ix_nvo_problems_topic_id", "nvo_problems", ["topic_id"])
    op.create_index("ix_nvo_problems_slot_number", "nvo_problems", ["slot_number"])

    op.create_table(
        "nvo_problem_skills",
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("nvo_problems.id"), primary_key=True),
        sa.Column("skill_id", sa.Integer(), sa.ForeignKey("nvo_skills.id"), primary_key=True),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
    )


def downgrade() -> None:
    op.drop_table("nvo_problem_skills")
    op.drop_index("ix_nvo_problems_slot_number", table_name="nvo_problems")
    op.drop_index("ix_nvo_problems_topic_id", table_name="nvo_problems")
    op.drop_table("nvo_problems")
    op.drop_index("ix_nvo_skills_code", table_name="nvo_skills")
    op.drop_table("nvo_skills")
    op.drop_index("ix_nvo_topics_code", table_name="nvo_topics")
    op.drop_table("nvo_topics")
    op.drop_table("nvo_source_exams")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_content_models.py tests/test_migrations.py -v`
Expected: PASS, including the pre-existing `test_alembic_env_imports_every_model_module` and `test_a_baseline_revision_exists`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/nvo_content.py backend/alembic/env.py backend/tests/conftest.py backend/alembic/versions/b2c3d4e5f6a1_nvo_content_schema.py backend/tests/test_nvo_content_models.py
git commit -m "feat: add NVO content corpus schema (Phase 0)"
```

---

## Task 2: Metadata-filter retrieval service + feature flag (Phase 1)

**Files:**
- Modify: `backend/app/config.py`
- Create: `backend/app/services/nvo_content_retrieval.py`
- Test: `backend/tests/test_nvo_content_retrieval.py`

**Interfaces:**
- Consumes: `NvoProblem`, `NvoTopic` from `app.models.nvo_content` (Task 1).
- Produces: `get_slot_candidates(db, slot_number, limit=20) -> list[NvoProblem]`, `build_slot_pool(db, slot_numbers) -> dict[int, list[NvoProblem]] | None`, `problem_to_variant(problem) -> dict`, `slot_pool_to_catalog(db, pool) -> dict`, `select_variant_for_slot(candidates) -> NvoProblem`. `slot_pool_to_catalog`'s output shape (`{"slots": {"<n>": {"topic": str, "notes": str, "variants": [...]}}}`) matches `app.routers.nvo.load_nvo_catalog()`'s shape exactly — Task 6 relies on that. `settings.NVO_USE_DB_RETRIEVAL: bool` and `settings.NVO_USE_EMBEDDING_RETRIEVAL: bool` on `app.config.settings`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_nvo_content_retrieval.py
import json

import pytest

from app.models.nvo_content import NvoProblem, NvoTopic
from app.services.nvo_content_retrieval import (
    build_slot_pool,
    get_slot_candidates,
    problem_to_variant,
    select_variant_for_slot,
    slot_pool_to_catalog,
)


@pytest.fixture
def seeded_topic(db):
    topic = NvoTopic(
        code="arithmetic_expression_evaluation",
        name="Arithmetic",
        notes="Evaluate a numeric expression.",
    )
    db.add(topic)
    db.flush()
    return topic


def _make_problem(db, topic, slot_number=1, external_ref="2024_v1", is_active=True, quality_score=1.0):
    problem = NvoProblem(
        topic_id=topic.id,
        external_ref=external_ref,
        slot_number=slot_number,
        answer_format="mcq",
        statement="Стойността на израза е:",
        options_json=json.dumps(["А) 1", "Б) 2", "В) 3", "Г) 4"], ensure_ascii=False),
        correct_answer_json=json.dumps("В", ensure_ascii=False),
        difficulty="easy",
        is_active=is_active,
        quality_score=quality_score,
    )
    db.add(problem)
    db.commit()
    return problem


def test_get_slot_candidates_filters_inactive(db, seeded_topic):
    _make_problem(db, seeded_topic, external_ref="a", is_active=True)
    _make_problem(db, seeded_topic, external_ref="b", is_active=False)

    candidates = get_slot_candidates(db, slot_number=1)
    assert [c.external_ref for c in candidates] == ["a"]


def test_get_slot_candidates_orders_by_quality(db, seeded_topic):
    _make_problem(db, seeded_topic, external_ref="low", quality_score=0.2)
    _make_problem(db, seeded_topic, external_ref="high", quality_score=0.9)

    candidates = get_slot_candidates(db, slot_number=1)
    assert [c.external_ref for c in candidates] == ["high", "low"]


def test_build_slot_pool_returns_none_when_any_slot_empty(db, seeded_topic):
    _make_problem(db, seeded_topic, slot_number=1)
    assert build_slot_pool(db, [1, 2]) is None


def test_build_slot_pool_returns_candidates_for_every_slot(db, seeded_topic):
    _make_problem(db, seeded_topic, slot_number=1, external_ref="a")
    _make_problem(db, seeded_topic, slot_number=1, external_ref="b")

    pool = build_slot_pool(db, [1])
    assert set(pool.keys()) == {1}
    assert len(pool[1]) == 2


def test_problem_to_variant_matches_catalog_shape(db, seeded_topic):
    problem = _make_problem(db, seeded_topic)
    variant = problem_to_variant(problem)

    assert variant["source"] == problem.external_ref
    assert variant["correct_answer"] == "В"
    assert variant["options"] == ["А) 1", "Б) 2", "В) 3", "Г) 4"]


def test_slot_pool_to_catalog_shape(db, seeded_topic):
    _make_problem(db, seeded_topic, slot_number=1)
    pool = build_slot_pool(db, [1])

    catalog = slot_pool_to_catalog(db, pool)
    assert catalog["slots"]["1"]["topic"] == "arithmetic_expression_evaluation"
    assert catalog["slots"]["1"]["notes"] == "Evaluate a numeric expression."
    assert len(catalog["slots"]["1"]["variants"]) == 1


def test_select_variant_for_slot_picks_from_candidates(db, seeded_topic):
    a = _make_problem(db, seeded_topic, external_ref="a")
    b = _make_problem(db, seeded_topic, slot_number=1, external_ref="b")
    chosen = select_variant_for_slot([a, b])
    assert chosen in (a, b)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_content_retrieval.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.nvo_content_retrieval'`

- [ ] **Step 3: Write minimal implementation**

Modify `backend/app/config.py` — add inside `class Settings(BaseSettings):`, after `OPENAI_NVO_MODEL`:

```python
    # NVO content architecture (see NVO_CONTENT_ARCHITECTURE_PLAN.md).
    # Both default off: the DB tables may be empty (no backfill run yet) and
    # generation must keep working from the file catalog until an operator
    # opts in deliberately after running the backfill.
    NVO_USE_DB_RETRIEVAL: bool = False
    NVO_USE_EMBEDDING_RETRIEVAL: bool = False
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
```

```python
# backend/app/services/nvo_content_retrieval.py
"""Deterministic metadata-filter retrieval over the NVO problem corpus.

Implements NVO_CONTENT_ARCHITECTURE_PLAN.md Phase 1/3: the DB-backed read
path is used when `settings.NVO_USE_DB_RETRIEVAL` is on and the corpus has
content for every slot the caller needs; otherwise the caller falls back to
the file-based catalog (app.routers.nvo.load_nvo_catalog). This module never
raises on a missing/partial corpus — it returns None/empty and lets the
caller fall back.
"""
from __future__ import annotations

import json
import logging
import random

from sqlalchemy.orm import Session

from app.models.nvo_content import NvoProblem, NvoTopic

logger = logging.getLogger(__name__)


def get_slot_candidates(db: Session, slot_number: int, limit: int = 20) -> list[NvoProblem]:
    """Active problems eligible for one NVO template slot, best quality first."""
    return (
        db.query(NvoProblem)
        .filter(NvoProblem.slot_number == slot_number, NvoProblem.is_active.is_(True))
        .order_by(NvoProblem.quality_score.desc(), NvoProblem.id.asc())
        .limit(limit)
        .all()
    )


def build_slot_pool(db: Session, slot_numbers: list[int]) -> dict[int, list[NvoProblem]] | None:
    """Candidate lists for every requested slot, or None if any slot is empty.

    A partial corpus is treated as "not ready": generation must not silently
    mix a DB-sourced slot with the file catalog's slot for the same exam, so
    one missing slot fails the whole DB path and the caller uses the file
    catalog for all slots instead.
    """
    pool: dict[int, list[NvoProblem]] = {}
    for slot_number in slot_numbers:
        candidates = get_slot_candidates(db, slot_number)
        if not candidates:
            logger.info("NVO DB retrieval: slot %s has no active candidates; falling back", slot_number)
            return None
        pool[slot_number] = candidates
    return pool


def problem_to_variant(problem: NvoProblem) -> dict:
    """Shape one NvoProblem like a catalog `variants[]` entry."""
    return {
        "source": problem.external_ref,
        "question": problem.statement,
        "options": json.loads(problem.options_json) if problem.options_json else None,
        "open_parts": json.loads(problem.open_parts_json) if problem.open_parts_json else None,
        "correct_answer": json.loads(problem.correct_answer_json),
        "difficulty": problem.difficulty,
    }


def slot_pool_to_catalog(db: Session, pool: dict[int, list[NvoProblem]]) -> dict:
    """Shape a DB-sourced slot pool like `load_nvo_catalog()`'s `{"slots": {...}}`."""
    topics = {t.id: t for t in db.query(NvoTopic).all()}
    slots: dict[str, dict] = {}
    for slot_number, candidates in pool.items():
        topic = topics.get(candidates[0].topic_id)
        slots[str(slot_number)] = {
            "topic": topic.code if topic else "general",
            "notes": (topic.notes or "") if topic else "",
            "variants": [problem_to_variant(p) for p in candidates],
        }
    return {"slots": slots}


def select_variant_for_slot(candidates: list[NvoProblem]) -> NvoProblem:
    return random.choice(candidates)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_content_retrieval.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/app/services/nvo_content_retrieval.py backend/tests/test_nvo_content_retrieval.py
git commit -m "feat: add NVO metadata-filter retrieval service and feature flags (Phase 1)"
```

---

## Task 3: Backfill script (Phase 2)

**Files:**
- Create: `backend/app/services/nvo_content_backfill.py`
- Test: `backend/tests/test_nvo_content_backfill.py`

**Interfaces:**
- Consumes: `NvoProblem`, `NvoSourceExam`, `NvoTopic` (Task 1).
- Produces: `load_catalog(path=CATALOG_PATH) -> dict`, `backfill_catalog(db, catalog) -> dict` (returns `{"created": int, "updated": int, "slots": int}`), `run() -> dict` (opens its own session, for CLI use via `python -m app.services.nvo_content_backfill`).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_nvo_content_backfill.py
import json

from app.models.nvo_content import NvoProblem, NvoSourceExam, NvoTopic
from app.services.nvo_content_backfill import backfill_catalog


def _tiny_catalog() -> dict:
    return {
        "slots": {
            "1": {
                "topic": "arithmetic_expression_evaluation",
                "notes": "Evaluate a numeric expression.",
                "variants": [
                    {
                        "source": "2024_v1",
                        "question": "Стойността на израза ...",
                        "options": ["А) 1", "Б) 2", "В) 3", "Г) 4"],
                        "correct_answer": "В",
                        "difficulty": "easy",
                    },
                ],
            },
            "21": {
                "topic": "open_inequality_plus_equation_plus_check",
                "notes": "Solve inequality then equation.",
                "variants": [
                    {
                        "source": "2024_v1",
                        "question": "А) Решете ...",
                        "open_parts": ["А", "Б"],
                        "correct_answer": ["А) x>1", "Б) x=2"],
                        "difficulty": "hard",
                    },
                ],
            },
        },
    }


def test_backfill_creates_topics_sources_and_problems(db):
    summary = backfill_catalog(db, _tiny_catalog())

    assert summary == {"created": 2, "updated": 0, "slots": 2}
    assert db.query(NvoTopic).count() == 2
    assert db.query(NvoSourceExam).filter_by(year=2024, variant="v1").count() == 1
    assert db.query(NvoProblem).count() == 2


def test_backfill_sets_answer_format_by_slot(db):
    backfill_catalog(db, _tiny_catalog())

    mcq = db.query(NvoProblem).filter_by(slot_number=1).one()
    open_q = db.query(NvoProblem).filter_by(slot_number=21).one()
    assert mcq.answer_format == "mcq"
    assert open_q.answer_format == "open"
    assert json.loads(open_q.correct_answer_json) == ["А) x>1", "Б) x=2"]


def test_backfill_is_idempotent_on_rerun(db):
    catalog = _tiny_catalog()
    backfill_catalog(db, catalog)
    summary_second_run = backfill_catalog(db, catalog)

    assert summary_second_run == {"created": 0, "updated": 2, "slots": 2}
    assert db.query(NvoProblem).count() == 2


def test_backfill_updates_changed_fields(db):
    catalog = _tiny_catalog()
    backfill_catalog(db, catalog)

    catalog["slots"]["1"]["variants"][0]["correct_answer"] = "Б"
    backfill_catalog(db, catalog)

    problem = db.query(NvoProblem).filter_by(slot_number=1, external_ref="2024_v1").one()
    assert json.loads(problem.correct_answer_json) == "Б"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_content_backfill.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.nvo_content_backfill'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/nvo_content_backfill.py
"""Backfill NvoTopic/NvoSourceExam/NvoProblem rows from nvo_question_catalog.json.

Implements NVO_CONTENT_ARCHITECTURE_PLAN.md Phase 2. Idempotent: re-running
upserts by (slot_number, external_ref) instead of duplicating rows, so it is
safe to run again after every catalog edit.

Run directly: `python -m app.services.nvo_content_backfill`
"""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.nvo_content import NvoProblem, NvoSourceExam, NvoTopic

logger = logging.getLogger(__name__)

CATALOG_PATH = Path(__file__).resolve().parents[2] / "nvo_question_catalog.json"
_OPEN_SLOTS = {21, 22, 23}
_SOURCE_RE = re.compile(r"^(\d{4})_v(\d+)$")


def load_catalog(path: Path = CATALOG_PATH) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_or_create_topic(db: Session, code: str, notes: str) -> NvoTopic:
    topic = db.query(NvoTopic).filter_by(code=code).one_or_none()
    if topic is None:
        topic = NvoTopic(code=code, name=code.replace("_", " ").capitalize(), notes=notes)
        db.add(topic)
        db.flush()
    elif notes and topic.notes != notes:
        topic.notes = notes
    return topic


def _get_or_create_source_exam(db: Session, source_ref: str) -> NvoSourceExam | None:
    match = _SOURCE_RE.match(source_ref)
    if not match:
        return None
    year, variant = int(match.group(1)), f"v{match.group(2)}"
    exam = (
        db.query(NvoSourceExam)
        .filter_by(year=year, variant=variant, source_type="official")
        .one_or_none()
    )
    if exam is None:
        exam = NvoSourceExam(
            title=f"{year} NVO official exam ({variant})",
            year=year,
            variant=variant,
            source_type="official",
        )
        db.add(exam)
        db.flush()
    return exam


def backfill_catalog(db: Session, catalog: dict) -> dict:
    """Upsert every slot/variant in `catalog` into the DB. Returns a summary dict."""
    slots = catalog.get("slots", {})
    created, updated = 0, 0

    for slot_key, slot in slots.items():
        slot_number = int(slot_key)
        answer_format = "open" if slot_number in _OPEN_SLOTS else "mcq"
        topic = _get_or_create_topic(db, slot.get("topic", "general"), slot.get("notes", ""))

        for variant in slot.get("variants", []):
            external_ref = str(variant.get("source", ""))
            if not external_ref:
                logger.warning("Skipping slot %s variant with no source ref", slot_number)
                continue

            source_exam = _get_or_create_source_exam(db, external_ref)
            existing = (
                db.query(NvoProblem)
                .filter_by(slot_number=slot_number, external_ref=external_ref)
                .one_or_none()
            )

            options = variant.get("options")
            open_parts = variant.get("open_parts")
            fields = dict(
                source_exam_id=source_exam.id if source_exam else None,
                topic_id=topic.id,
                answer_format=answer_format,
                statement=str(variant.get("question", "")),
                options_json=json.dumps(options, ensure_ascii=False) if options else None,
                correct_answer_json=json.dumps(variant.get("correct_answer"), ensure_ascii=False),
                open_parts_json=json.dumps(open_parts, ensure_ascii=False) if open_parts else None,
                difficulty=variant.get("difficulty", "medium"),
            )

            if existing is None:
                db.add(NvoProblem(slot_number=slot_number, external_ref=external_ref, **fields))
                created += 1
            else:
                for key, value in fields.items():
                    setattr(existing, key, value)
                updated += 1

    db.commit()
    return {"created": created, "updated": updated, "slots": len(slots)}


def run() -> dict:
    catalog = load_catalog()
    db = SessionLocal()
    try:
        return backfill_catalog(db, catalog)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(run(), indent=2, ensure_ascii=False))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_content_backfill.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/nvo_content_backfill.py backend/tests/test_nvo_content_backfill.py
git commit -m "feat: add idempotent NVO catalog backfill script (Phase 2)"
```

---

## Task 4: QA report (Phase 2)

**Files:**
- Create: `backend/app/services/nvo_content_qa.py`
- Test: `backend/tests/test_nvo_content_qa.py`

**Interfaces:**
- Consumes: `NvoProblem` (Task 1).
- Produces: `qa_report(db) -> dict` with keys `total_active_problems`, `missing_slots`, `thin_slots`, `integrity_issues`, `difficulty_distribution`, `is_generation_ready` — reused by Task 10's benchmark.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_nvo_content_qa.py
import json

import pytest

from app.models.nvo_content import NvoProblem, NvoTopic
from app.services.nvo_content_qa import qa_report


@pytest.fixture
def topic(db):
    t = NvoTopic(code="t", name="T")
    db.add(t)
    db.flush()
    return t


def _problem(db, topic, slot_number, answer_format="mcq", options=("А", "Б", "В", "Г"), correct="А"):
    p = NvoProblem(
        topic_id=topic.id,
        external_ref=f"ref-{slot_number}-{len(options) if options else 0}",
        slot_number=slot_number,
        answer_format=answer_format,
        statement="q",
        options_json=json.dumps(list(options), ensure_ascii=False) if options else None,
        correct_answer_json=json.dumps(correct, ensure_ascii=False),
        difficulty="easy",
    )
    db.add(p)
    db.commit()
    return p


def test_reports_missing_slots(db, topic):
    _problem(db, topic, slot_number=1)
    report = qa_report(db)
    assert 2 in report["missing_slots"]
    assert report["is_generation_ready"] is False


def test_flags_mcq_without_four_options(db, topic):
    _problem(db, topic, slot_number=1, options=("А", "Б"))
    report = qa_report(db)
    issue_types = {i for entry in report["integrity_issues"] for i in entry["issues"]}
    assert "mcq_without_4_options" in issue_types


def test_flags_answer_format_mismatch(db, topic):
    _problem(db, topic, slot_number=21, answer_format="mcq")  # slot 21 must be open
    report = qa_report(db)
    issue_types = {i for entry in report["integrity_issues"] for i in entry["issues"]}
    assert any(i.startswith("answer_format_mismatch") for i in issue_types)


def test_generation_ready_when_all_23_slots_present_and_clean(db, topic):
    for slot in range(1, 21):
        _problem(db, topic, slot_number=slot)
    for slot in (21, 22, 23):
        _problem(db, topic, slot_number=slot, answer_format="open", options=None, correct=["А) x"])

    report = qa_report(db)
    assert report["missing_slots"] == []
    assert report["integrity_issues"] == []
    assert report["is_generation_ready"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_content_qa.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.nvo_content_qa'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/nvo_content_qa.py
"""QA report over the NVO problem corpus: coverage, balance, and integrity checks.

Implements NVO_CONTENT_ARCHITECTURE_PLAN.md Phase 2's "run QA report and fix
low-confidence records". Read-only — flags problems for a human to review,
never mutates or deactivates anything automatically.
"""
from __future__ import annotations

import json
from collections import Counter

from sqlalchemy.orm import Session

from app.models.nvo_content import NvoProblem

_REQUIRED_SLOTS = set(range(1, 24))
_OPEN_SLOTS = {21, 22, 23}
_MIN_VARIANTS_PER_SLOT = 3


def qa_report(db: Session) -> dict:
    problems = db.query(NvoProblem).filter(NvoProblem.is_active.is_(True)).all()

    by_slot: dict[int, list[NvoProblem]] = {}
    for p in problems:
        by_slot.setdefault(p.slot_number, []).append(p)

    missing_slots = sorted(_REQUIRED_SLOTS - set(by_slot.keys()))
    thin_slots = sorted(
        slot for slot, rows in by_slot.items() if len(rows) < _MIN_VARIANTS_PER_SLOT
    )

    integrity_issues: list[dict] = []
    for p in problems:
        issues = []
        if not p.statement or not p.statement.strip():
            issues.append("empty_statement")
        if not p.correct_answer_json:
            issues.append("missing_correct_answer")
        expected_format = "open" if p.slot_number in _OPEN_SLOTS else "mcq"
        if p.answer_format != expected_format:
            issues.append(f"answer_format_mismatch:expected_{expected_format}")
        if p.answer_format == "mcq":
            options = json.loads(p.options_json) if p.options_json else []
            if len(options) != 4:
                issues.append("mcq_without_4_options")
        if issues:
            integrity_issues.append({"problem_id": p.id, "slot_number": p.slot_number, "issues": issues})

    difficulty_distribution = Counter(p.difficulty for p in problems)

    return {
        "total_active_problems": len(problems),
        "missing_slots": missing_slots,
        "thin_slots": thin_slots,
        "integrity_issues": integrity_issues,
        "difficulty_distribution": dict(difficulty_distribution),
        "is_generation_ready": not missing_slots and not integrity_issues,
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_content_qa.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/nvo_content_qa.py backend/tests/test_nvo_content_qa.py
git commit -m "feat: add NVO content corpus QA report (Phase 2)"
```

---

## Task 5: Generation-run audit table (Phase 3 schema)

**Files:**
- Modify: `backend/app/models/nvo_content.py`
- Modify: `backend/tests/test_nvo_content_models.py`
- Create: `backend/alembic/versions/c3d4e5f6a1b2_nvo_generation_runs.py`

**Interfaces:**
- Produces: `NvoGenerationRun` (`.requested_profile_json`, `.selected_problem_ids_json`, `.source`, `.prompt_hash`, `.model`, `.status`, `.output_json`, `.validation_report_json`, `.created_at`) in `app.models.nvo_content`, used by Task 6.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_nvo_content_models.py`:

```python
def test_generation_run_round_trip(db):
    from app.models.nvo_content import NvoGenerationRun

    run = NvoGenerationRun(
        requested_profile_json=json.dumps({"format": "full", "difficulty": "standard"}),
        source="file_catalog",
        status="completed",
    )
    db.add(run)
    db.commit()

    fetched = db.query(NvoGenerationRun).one()
    assert fetched.source == "file_catalog"
    assert fetched.status == "completed"
    assert fetched.selected_problem_ids_json is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_content_models.py::test_generation_run_round_trip -v`
Expected: FAIL with `ImportError: cannot import name 'NvoGenerationRun'`

- [ ] **Step 3: Write minimal implementation**

Append to `backend/app/models/nvo_content.py`:

```python
class NvoGenerationRun(Base):
    """Audit trail: which corpus (DB or file catalog) fed one generation call."""

    __tablename__ = "nvo_generation_runs"

    id = Column(Integer, primary_key=True, index=True)
    requested_profile_json = Column(Text, nullable=False)
    selected_problem_ids_json = Column(Text, nullable=True)
    source = Column(String(16), nullable=False)  # 'db' | 'file_catalog'
    prompt_hash = Column(String(64), nullable=True)
    model = Column(String(64), nullable=True)
    status = Column(String(16), nullable=False, default="pending")
    output_json = Column(Text, nullable=True)
    validation_report_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
```

```python
# backend/alembic/versions/c3d4e5f6a1b2_nvo_generation_runs.py
"""nvo generation runs

Audit trail for NVO_CONTENT_ARCHITECTURE_PLAN.md Phase 3: one row per
generation call recording whether it was served from the DB corpus or the
file catalog fallback.

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f6a1
Create Date: 2026-08-26 00:00:01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c3d4e5f6a1b2"
down_revision: Union[str, None] = "b2c3d4e5f6a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nvo_generation_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("requested_profile_json", sa.Text(), nullable=False),
        sa.Column("selected_problem_ids_json", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("prompt_hash", sa.String(length=64), nullable=True),
        sa.Column("model", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("output_json", sa.Text(), nullable=True),
        sa.Column("validation_report_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("nvo_generation_runs")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_content_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/nvo_content.py backend/tests/test_nvo_content_models.py backend/alembic/versions/c3d4e5f6a1b2_nvo_generation_runs.py
git commit -m "feat: add NVO generation-run audit table (Phase 3 schema)"
```

---

## Task 6: Wire retrieval + audit trail into generation (Phase 3 integration)

**Files:**
- Modify: `backend/app/routers/nvo.py`
- Test: `backend/tests/test_nvo_generation_retrieval_integration.py`

**Interfaces:**
- Consumes: `build_slot_pool`, `slot_pool_to_catalog` (Task 2), `NvoGenerationRun` (Task 5), `settings.NVO_USE_DB_RETRIEVAL` (Task 2).
- Produces: `_load_catalog_or_db() -> tuple[dict, str]` and `_record_generation_run(*, profile, source, exam, model) -> None` in `app.routers.nvo`, both consumed again by Task 9. `GET /nvo/generation-runs/{run_id}` and `GET /nvo/retrieval/preview` (admin-only).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_nvo_generation_retrieval_integration.py
"""Integration tests for DB-backed vs file-catalog NVO generation source selection."""
import json

import pytest

from app.config import settings
from app.models.nvo_content import NvoGenerationRun, NvoProblem, NvoTopic


@pytest.fixture(autouse=True)
def _reset_flags():
    original_db = settings.NVO_USE_DB_RETRIEVAL
    original_emb = settings.NVO_USE_EMBEDDING_RETRIEVAL
    yield
    settings.NVO_USE_DB_RETRIEVAL = original_db
    settings.NVO_USE_EMBEDDING_RETRIEVAL = original_emb


def test_flag_off_always_uses_file_catalog(db):
    from app.routers.nvo import _load_catalog_or_db

    settings.NVO_USE_DB_RETRIEVAL = False
    catalog, source = _load_catalog_or_db()
    assert source == "file_catalog"
    assert "slots" in catalog


def test_flag_on_with_empty_db_falls_back_to_file_catalog(db):
    from app.routers.nvo import _load_catalog_or_db

    settings.NVO_USE_DB_RETRIEVAL = True
    catalog, source = _load_catalog_or_db()
    assert source == "file_catalog"


def _seed_full_corpus(db):
    open_slots = {21, 22, 23}
    for slot in range(1, 24):
        topic = NvoTopic(code=f"topic-{slot}", name=f"Topic {slot}")
        db.add(topic)
        db.flush()
        db.add(NvoProblem(
            topic_id=topic.id,
            external_ref=f"seed-{slot}",
            slot_number=slot,
            answer_format="open" if slot in open_slots else "mcq",
            statement=f"question {slot}",
            options_json=None if slot in open_slots else json.dumps(["А", "Б", "В", "Г"]),
            correct_answer_json=json.dumps(["a"]) if slot in open_slots else json.dumps("А"),
            difficulty="easy",
        ))
    db.commit()


def test_flag_on_with_full_corpus_uses_db(db):
    from app.routers.nvo import _load_catalog_or_db

    settings.NVO_USE_DB_RETRIEVAL = True
    _seed_full_corpus(db)

    catalog, source = _load_catalog_or_db()
    assert source == "db"
    assert len(catalog["slots"]) == 23


def test_record_generation_run_persists_row(db):
    from app.routers.nvo import NVOExam, _record_generation_run

    exam = NVOExam(exam_id="abc123", questions=[])
    _record_generation_run(profile={"format": "full"}, source="file_catalog", exam=exam, model=None)

    run = db.query(NvoGenerationRun).order_by(NvoGenerationRun.id.desc()).first()
    assert run is not None
    assert run.source == "file_catalog"
    assert json.loads(run.requested_profile_json) == {"format": "full"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_generation_retrieval_integration.py -v`
Expected: FAIL with `ImportError: cannot import name '_load_catalog_or_db'`

- [ ] **Step 3: Write minimal implementation**

Modify `backend/app/routers/nvo.py` — add these imports near the top (with the other `app.*` imports):

```python
import logging

from app.database import SessionLocal
from app.models.nvo_content import NvoGenerationRun
from app.services.nvo_content_retrieval import build_slot_pool, slot_pool_to_catalog

logger = logging.getLogger(__name__)
```

Add these two functions directly after `load_nvo_catalog()`:

```python
def _load_catalog_or_db() -> tuple[dict, str]:
    """Return a catalog-shaped dict plus its source tag ('db' or 'file_catalog').

    DB retrieval is tried first only when the feature flag is on; any
    exception, or a corpus missing any of the 23 slots, falls back to the
    file catalog so generation never breaks because of this.
    """
    if settings.NVO_USE_DB_RETRIEVAL:
        db = SessionLocal()
        try:
            pool = build_slot_pool(db, list(range(1, 24)))
            if pool is not None:
                return slot_pool_to_catalog(db, pool), "db"
        except Exception:
            logger.exception("NVO DB retrieval failed; falling back to file catalog")
        finally:
            db.close()
    return load_nvo_catalog(), "file_catalog"


def _record_generation_run(*, profile: dict, source: str, exam: "NVOExam", model: str | None) -> None:
    """Best-effort audit row. Never blocks or fails a generation on write error."""
    db = SessionLocal()
    try:
        db.add(
            NvoGenerationRun(
                requested_profile_json=json.dumps(profile, ensure_ascii=False),
                source=source,
                model=model,
                status="completed",
            )
        )
        db.commit()
    except Exception:
        logger.exception("Failed to record NVO generation run (non-fatal)")
        db.rollback()
    finally:
        db.close()
```

In `_fallback_generate_from_pool`, replace `catalog = load_nvo_catalog()` with:

```python
    catalog, _source = _load_catalog_or_db()
```

At the end of `_fallback_generate_from_pool`, replace the final `return NVOExam(exam_id=str(uuid.uuid4())[:8], questions=normalized)` with:

```python
    exam = NVOExam(exam_id=str(uuid.uuid4())[:8], questions=normalized)
    _record_generation_run(profile={"format": format, "path": "fallback_pool"}, source=_source, exam=exam, model=None)
    return exam
```

In `_generate_via_openai`, replace `catalog = load_nvo_catalog()` with:

```python
    catalog, _source = _load_catalog_or_db()
```

At the end of `_generate_via_openai`, replace the final `return NVOExam(exam_id=str(uuid.uuid4())[:8], questions=validated)` with:

```python
    exam = NVOExam(exam_id=str(uuid.uuid4())[:8], questions=validated)
    _record_generation_run(
        profile={"format": format, "difficulty": difficulty, "path": "openai"},
        source=_source,
        exam=exam,
        model=settings.OPENAI_NVO_MODEL,
    )
    return exam
```

Add these two admin endpoints near `/admin/reset-all-xp` at the end of the file:

```python
@router.get("/generation-runs/{run_id}")
async def get_nvo_generation_run(
    run_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    run = db.query(NvoGenerationRun).filter_by(id=run_id).one_or_none()
    if not run:
        raise HTTPException(status_code=404, detail="Generation run not found")
    return {
        "id": run.id,
        "requested_profile": json.loads(run.requested_profile_json),
        "source": run.source,
        "model": run.model,
        "status": run.status,
        "created_at": run.created_at.isoformat(),
    }


@router.get("/retrieval/preview")
async def preview_nvo_retrieval(
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    """Admin-only: report whether the DB corpus is generation-ready right now."""
    pool = build_slot_pool(db, list(range(1, 24)))
    return {
        "use_db_retrieval_flag": settings.NVO_USE_DB_RETRIEVAL,
        "db_corpus_ready": pool is not None,
        "slots_with_candidates": sorted(pool.keys()) if pool else [],
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_generation_retrieval_integration.py tests/test_nvo_generation.py -v`
Expected: PASS — including the pre-existing `test_nvo_generation.py` suite, confirming the file-catalog path is unchanged when the flag is off.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/nvo.py backend/tests/test_nvo_generation_retrieval_integration.py
git commit -m "feat: wire DB retrieval and generation-run audit into NVO generation (Phase 3)"
```

---

## Task 7: Embedding storage + generation service (Phase 4)

**Files:**
- Modify: `backend/app/models/nvo_content.py`
- Modify: `backend/tests/test_nvo_content_models.py`
- Create: `backend/alembic/versions/d4e5f6a1b2c3_nvo_problem_embeddings.py`
- Create: `backend/app/services/nvo_content_embeddings.py`
- Test: `backend/tests/test_nvo_content_embeddings.py`

**Interfaces:**
- Consumes: `NvoProblem` (Task 1), `settings.OPENAI_API_KEY`, `settings.OPENAI_EMBEDDING_MODEL` (Task 2).
- Produces: `NvoProblemEmbedding` model (`.problem_id`, `.embedding_json`, `.embedding_model`, `.embedded_at`); `problems_needing_embeddings(db, model) -> list[NvoProblem]`, `embed_texts(texts, model) -> list[list[float]]`, `backfill_embeddings(db, model=None) -> dict`, `run() -> dict` in `app.services.nvo_content_embeddings` — `embed_texts` and `NvoProblemEmbedding` are consumed by Task 8/9.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_nvo_content_models.py`:

```python
def test_problem_embedding_round_trip(db):
    from app.models.nvo_content import NvoProblemEmbedding

    topic = NvoTopic(code="emb-topic", name="Emb")
    db.add(topic)
    db.flush()
    problem = NvoProblem(
        topic_id=topic.id, external_ref="e1", slot_number=1,
        answer_format="mcq", statement="s", correct_answer_json=json.dumps("А"),
    )
    db.add(problem)
    db.flush()

    db.add(NvoProblemEmbedding(
        problem_id=problem.id,
        embedding_json=json.dumps([0.1, 0.2, 0.3]),
        embedding_model="text-embedding-3-small",
    ))
    db.commit()

    fetched = db.query(NvoProblemEmbedding).filter_by(problem_id=problem.id).one()
    assert json.loads(fetched.embedding_json) == [0.1, 0.2, 0.3]
```

Create `backend/tests/test_nvo_content_embeddings.py`:

```python
import json

import pytest

from app.models.nvo_content import NvoProblem, NvoProblemEmbedding, NvoTopic
from app.services import nvo_content_embeddings as embeddings_module
from app.services.nvo_content_embeddings import backfill_embeddings, problems_needing_embeddings


@pytest.fixture
def topic(db):
    t = NvoTopic(code="t", name="T")
    db.add(t)
    db.flush()
    return t


def _problem(db, topic, ref="a"):
    p = NvoProblem(
        topic_id=topic.id, external_ref=ref, slot_number=1, answer_format="mcq",
        statement=f"statement {ref}", options_json=json.dumps(["А", "Б", "В", "Г"]),
        correct_answer_json=json.dumps("А"), difficulty="easy",
    )
    db.add(p)
    db.commit()
    return p


def test_problems_needing_embeddings_excludes_already_embedded(db, topic):
    p1 = _problem(db, topic, "a")
    p2 = _problem(db, topic, "b")
    db.add(NvoProblemEmbedding(problem_id=p1.id, embedding_json=json.dumps([0.1, 0.2]), embedding_model="m"))
    db.commit()

    pending = problems_needing_embeddings(db, "m")
    assert [p.id for p in pending] == [p2.id]


def test_backfill_embeddings_stores_vectors(db, topic, monkeypatch):
    p1 = _problem(db, topic, "a")
    p2 = _problem(db, topic, "b")

    monkeypatch.setattr(
        embeddings_module, "embed_texts",
        lambda texts, model: [[float(i)] * 3 for i in range(len(texts))],
    )

    summary = backfill_embeddings(db, model="test-model")

    assert summary == {"embedded": 2, "model": "test-model"}
    rows = db.query(NvoProblemEmbedding).all()
    assert {r.problem_id for r in rows} == {p1.id, p2.id}


def test_backfill_embeddings_is_a_noop_when_nothing_pending(db, topic, monkeypatch):
    _problem(db, topic, "a")
    monkeypatch.setattr(embeddings_module, "embed_texts", lambda texts, model: [[0.0] for _ in texts])
    backfill_embeddings(db, model="test-model")

    calls = []
    monkeypatch.setattr(
        embeddings_module, "embed_texts",
        lambda texts, model: (calls.append(texts), [])[1],
    )
    summary = backfill_embeddings(db, model="test-model")

    assert summary == {"embedded": 0, "model": "test-model"}
    assert calls == []


def test_embed_texts_requires_api_key(monkeypatch):
    from app.config import settings

    monkeypatch.setattr(settings, "OPENAI_API_KEY", "")
    with pytest.raises(ValueError):
        embeddings_module.embed_texts(["x"], "m")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_content_embeddings.py tests/test_nvo_content_models.py::test_problem_embedding_round_trip -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.nvo_content_embeddings'`

- [ ] **Step 3: Write minimal implementation**

Append to `backend/app/models/nvo_content.py`:

```python
class NvoProblemEmbedding(Base):
    """Cached embedding vector for one problem's statement text.

    Stored as JSON (not a native vector column) so it works identically on
    SQLite (the test suite's only dialect, see tests/conftest.py) and
    Postgres — no pgvector dependency. Similarity is computed in Python; see
    app.services.nvo_content_retrieval.cosine_similarity. Fine at this
    corpus's scale (hundreds of rows); revisit only if it grows into the
    tens of thousands.
    """

    __tablename__ = "nvo_problem_embeddings"

    problem_id = Column(Integer, ForeignKey("nvo_problems.id"), primary_key=True)
    embedding_json = Column(Text, nullable=False)
    embedding_model = Column(String(64), nullable=False)
    embedded_at = Column(DateTime, default=datetime.utcnow, nullable=False)
```

```python
# backend/alembic/versions/d4e5f6a1b2c3_nvo_problem_embeddings.py
"""nvo problem embeddings

Phase 4 (hybrid retrieval): cached embedding vectors per problem, stored as
JSON text rather than a native vector column so the same schema works on
SQLite (the test suite's only dialect) and Postgres without a pgvector
dependency.

Revision ID: d4e5f6a1b2c3
Revises: c3d4e5f6a1b2
Create Date: 2026-08-26 00:00:02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d4e5f6a1b2c3"
down_revision: Union[str, None] = "c3d4e5f6a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nvo_problem_embeddings",
        sa.Column("problem_id", sa.Integer(), sa.ForeignKey("nvo_problems.id"), primary_key=True),
        sa.Column("embedding_json", sa.Text(), nullable=False),
        sa.Column("embedding_model", sa.String(length=64), nullable=False),
        sa.Column("embedded_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("nvo_problem_embeddings")
```

```python
# backend/app/services/nvo_content_embeddings.py
"""Embedding generation for the NVO problem corpus (Phase 4: hybrid retrieval).

Calls OpenAI's embeddings API and caches the result in nvo_problem_embeddings,
keyed by problem_id. Re-embeds only rows missing an embedding for the current
model, so switching OPENAI_EMBEDDING_MODEL re-embeds everything exactly once
without touching rows already embedded under the old model.

Run directly: `python -m app.services.nvo_content_embeddings`
"""
from __future__ import annotations

import json
import logging

from openai import OpenAI
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.nvo_content import NvoProblem, NvoProblemEmbedding

logger = logging.getLogger(__name__)


def _embedding_text(problem: NvoProblem) -> str:
    """The text actually embedded — statement only. Options/answers are not
    semantic content worth ranking on and would bias similarity toward
    superficial option wording."""
    return problem.statement


def problems_needing_embeddings(db: Session, model: str) -> list[NvoProblem]:
    embedded_ids = {
        row.problem_id
        for row in db.query(NvoProblemEmbedding).filter_by(embedding_model=model).all()
    }
    return [
        p for p in db.query(NvoProblem).filter(NvoProblem.is_active.is_(True)).all()
        if p.id not in embedded_ids
    ]


def embed_texts(texts: list[str], model: str) -> list[list[float]]:
    if not settings.OPENAI_API_KEY:
        raise ValueError("OPENAI_API_KEY is not configured")
    client = OpenAI(api_key=settings.OPENAI_API_KEY, timeout=30.0)
    response = client.embeddings.create(model=model, input=texts)
    return [item.embedding for item in response.data]


def backfill_embeddings(db: Session, model: str | None = None) -> dict:
    model = model or settings.OPENAI_EMBEDDING_MODEL
    pending = problems_needing_embeddings(db, model)
    if not pending:
        return {"embedded": 0, "model": model}

    vectors = embed_texts([_embedding_text(p) for p in pending], model)
    for problem, vector in zip(pending, vectors):
        db.merge(
            NvoProblemEmbedding(
                problem_id=problem.id,
                embedding_json=json.dumps(vector),
                embedding_model=model,
            )
        )
    db.commit()
    return {"embedded": len(pending), "model": model}


def run() -> dict:
    db = SessionLocal()
    try:
        return backfill_embeddings(db)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(run(), indent=2))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_content_embeddings.py tests/test_nvo_content_models.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/nvo_content.py backend/tests/test_nvo_content_models.py backend/alembic/versions/d4e5f6a1b2c3_nvo_problem_embeddings.py backend/app/services/nvo_content_embeddings.py backend/tests/test_nvo_content_embeddings.py
git commit -m "feat: add NVO problem embedding storage and backfill (Phase 4)"
```

---

## Task 8: Vector similarity ranking + diversity reranker (Phase 4)

**Files:**
- Modify: `backend/app/services/nvo_content_retrieval.py`
- Modify: `backend/tests/test_nvo_content_retrieval.py`

**Interfaces:**
- Consumes: `NvoProblemEmbedding` (Task 7).
- Produces: `cosine_similarity(a, b) -> float`, `rank_by_similarity(db, candidates, query_embedding) -> list[tuple[NvoProblem, float]]`, `apply_diversity_filter(ranked, k, lexical_threshold=0.85) -> list[NvoProblem]` in `app.services.nvo_content_retrieval` — consumed by Task 9.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_nvo_content_retrieval.py`:

```python
def test_cosine_similarity_identical_vectors_is_one():
    from app.services.nvo_content_retrieval import cosine_similarity

    assert cosine_similarity([1.0, 0.0], [1.0, 0.0]) == pytest.approx(1.0)


def test_cosine_similarity_orthogonal_vectors_is_zero():
    from app.services.nvo_content_retrieval import cosine_similarity

    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_similarity_handles_zero_vector():
    from app.services.nvo_content_retrieval import cosine_similarity

    assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_rank_by_similarity_orders_best_match_first(db, seeded_topic):
    from app.models.nvo_content import NvoProblemEmbedding
    from app.services.nvo_content_retrieval import rank_by_similarity

    close = _make_problem(db, seeded_topic, external_ref="close")
    far = _make_problem(db, seeded_topic, slot_number=1, external_ref="far")
    db.add_all([
        NvoProblemEmbedding(problem_id=close.id, embedding_json=json.dumps([1.0, 0.0]), embedding_model="m"),
        NvoProblemEmbedding(problem_id=far.id, embedding_json=json.dumps([0.0, 1.0]), embedding_model="m"),
    ])
    db.commit()

    ranked = rank_by_similarity(db, [far, close], query_embedding=[1.0, 0.0])
    assert [p.external_ref for p, _score in ranked] == ["close", "far"]


def test_rank_by_similarity_unembedded_candidate_sorts_last(db, seeded_topic):
    from app.models.nvo_content import NvoProblemEmbedding
    from app.services.nvo_content_retrieval import rank_by_similarity

    embedded = _make_problem(db, seeded_topic, external_ref="embedded")
    unembedded = _make_problem(db, seeded_topic, slot_number=1, external_ref="unembedded")
    db.add(NvoProblemEmbedding(problem_id=embedded.id, embedding_json=json.dumps([1.0, 0.0]), embedding_model="m"))
    db.commit()

    ranked = rank_by_similarity(db, [unembedded, embedded], query_embedding=[1.0, 0.0])
    assert ranked[0][0].external_ref == "embedded"
    assert ranked[-1][1] == 0.0


def test_diversity_filter_drops_near_duplicate_statements(db, seeded_topic):
    from app.services.nvo_content_retrieval import apply_diversity_filter

    original = _make_problem(db, seeded_topic, external_ref="a")
    original.statement = "Стойността на израза 2+2 е:"
    near_dup = _make_problem(db, seeded_topic, slot_number=1, external_ref="b")
    near_dup.statement = "Стойността на израза  2 + 2  е:"
    distinct = _make_problem(db, seeded_topic, slot_number=1, external_ref="c")
    distinct.statement = "Реши уравнението x^2 - 4 = 0"
    db.commit()

    ranked = [(original, 0.9), (near_dup, 0.8), (distinct, 0.5)]
    selected = apply_diversity_filter(ranked, k=2)

    assert original in selected
    assert near_dup not in selected
    assert distinct in selected
    assert len(selected) == 2


def test_diversity_filter_stops_at_k(db, seeded_topic):
    from app.services.nvo_content_retrieval import apply_diversity_filter

    problems = [_make_problem(db, seeded_topic, slot_number=1, external_ref=f"p{i}") for i in range(5)]
    for i, p in enumerate(problems):
        p.statement = f"напълно различен въпрос номер {i}"
    db.commit()

    ranked = [(p, 1.0 - i * 0.1) for i, p in enumerate(problems)]
    selected = apply_diversity_filter(ranked, k=3)
    assert len(selected) == 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_content_retrieval.py -v`
Expected: FAIL with `ImportError: cannot import name 'cosine_similarity'`

- [ ] **Step 3: Write minimal implementation**

Append to `backend/app/services/nvo_content_retrieval.py` (add `import math` and `from difflib import SequenceMatcher` to the top imports, plus `from app.models.nvo_content import NvoProblem, NvoProblemEmbedding, NvoTopic`):

```python
import math
from difflib import SequenceMatcher

from app.models.nvo_content import NvoProblemEmbedding  # add to existing import line


def cosine_similarity(a: list[float], b: list[float]) -> float:
    if len(a) != len(b) or not a:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def rank_by_similarity(
    db: Session, candidates: list[NvoProblem], query_embedding: list[float]
) -> list[tuple[NvoProblem, float]]:
    """Candidates ordered by cosine similarity to `query_embedding`, best first.

    A candidate with no cached embedding sorts last (score 0.0) rather than
    being dropped — an un-embedded row is still a valid metadata-filtered
    candidate, just not semantically ranked yet.
    """
    embeddings = {
        row.problem_id: json.loads(row.embedding_json)
        for row in db.query(NvoProblemEmbedding)
        .filter(NvoProblemEmbedding.problem_id.in_([c.id for c in candidates]))
        .all()
    }
    scored = [
        (c, cosine_similarity(embeddings[c.id], query_embedding) if c.id in embeddings else 0.0)
        for c in candidates
    ]
    return sorted(scored, key=lambda pair: pair[1], reverse=True)


def _normalize_for_lexical_compare(text: str) -> str:
    return " ".join(text.lower().split())


def apply_diversity_filter(
    ranked: list[tuple[NvoProblem, float]],
    k: int,
    lexical_threshold: float = 0.85,
) -> list[NvoProblem]:
    """Take the top-scoring candidates while rejecting near-duplicates.

    Near-duplicate = statement text similarity (difflib ratio) at or above
    `lexical_threshold` against an already-selected item. Walks the
    similarity-ranked list in order, so ties still prefer the higher-ranked
    (more semantically relevant) variant.
    """
    selected: list[NvoProblem] = []
    for candidate, _score in ranked:
        candidate_text = _normalize_for_lexical_compare(candidate.statement)
        is_duplicate = any(
            SequenceMatcher(None, candidate_text, _normalize_for_lexical_compare(chosen.statement)).ratio()
            >= lexical_threshold
            for chosen in selected
        )
        if is_duplicate:
            continue
        selected.append(candidate)
        if len(selected) >= k:
            break
    return selected
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_content_retrieval.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/nvo_content_retrieval.py backend/tests/test_nvo_content_retrieval.py
git commit -m "feat: add cosine-similarity ranking and diversity dedup for NVO retrieval (Phase 4)"
```

---

## Task 9: Wire hybrid ranking into generation (Phase 4 integration)

**Files:**
- Modify: `backend/app/services/nvo_content_retrieval.py`
- Modify: `backend/app/routers/nvo.py`
- Modify: `backend/tests/test_nvo_generation_retrieval_integration.py`

**Interfaces:**
- Consumes: `rank_by_similarity`, `apply_diversity_filter` (Task 8), `NvoProblemEmbedding` (Task 7), `settings.NVO_USE_EMBEDDING_RETRIEVAL` (Task 2), `_load_catalog_or_db` (Task 6).
- Produces: `select_diverse_pool_for_slot(db, candidates, pool_size=3) -> list[NvoProblem]` in `app.services.nvo_content_retrieval`.

There is no free-text user query in NVO generation to rank candidates against. `select_diverse_pool_for_slot` ranks each slot's candidates against their own centroid embedding (a stand-in "typical/representative item" query) and diversity-filters them — this keeps the most representative, least-redundant variants and drops near-duplicates without an extra embedding call at generation time (offline embeddings only, per the spec's latency risk mitigation).

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_nvo_generation_retrieval_integration.py`:

```python
def test_embedding_flag_off_leaves_full_slot_pool_untouched(db):
    from app.routers.nvo import _load_catalog_or_db

    settings.NVO_USE_DB_RETRIEVAL = True
    settings.NVO_USE_EMBEDDING_RETRIEVAL = False
    _seed_full_corpus(db)

    catalog, source = _load_catalog_or_db()
    assert source == "db"
    assert len(catalog["slots"]["1"]["variants"]) == 1  # unchanged: 1 seeded variant


def test_embedding_flag_on_with_unembedded_corpus_is_a_safe_passthrough(db):
    from app.routers.nvo import _load_catalog_or_db

    settings.NVO_USE_DB_RETRIEVAL = True
    settings.NVO_USE_EMBEDDING_RETRIEVAL = True
    _seed_full_corpus(db)  # no embeddings seeded

    catalog, source = _load_catalog_or_db()
    assert source == "db"  # must not crash or fall back just because embeddings are missing


def test_embedding_flag_on_deduplicates_near_identical_variants(db):
    from app.models.nvo_content import NvoProblemEmbedding
    from app.routers.nvo import _load_catalog_or_db

    settings.NVO_USE_DB_RETRIEVAL = True
    settings.NVO_USE_EMBEDDING_RETRIEVAL = True

    open_slots = {21, 22, 23}
    topic1 = NvoTopic(code="t1", name="T1")
    db.add(topic1)
    db.flush()

    near_dup_variants = []
    for i, (ref, statement, vector) in enumerate([
        ("a", "почти еднакъв въпрос", [1.0, 0.0]),
        ("b", "почти еднакъв въпрос номер две", [0.99, 0.01]),
        ("c", "съвсем различен въпрос", [0.0, 1.0]),
    ]):
        p = NvoProblem(
            topic_id=topic1.id, external_ref=ref, slot_number=1, answer_format="mcq",
            statement=statement, options_json=json.dumps(["А", "Б", "В", "Г"]),
            correct_answer_json=json.dumps("А"), difficulty="easy",
        )
        db.add(p)
        db.flush()
        db.add(NvoProblemEmbedding(problem_id=p.id, embedding_json=json.dumps(vector), embedding_model="m"))
        near_dup_variants.append(p)
    db.commit()

    for slot in list(range(2, 21)) + [21, 22, 23]:
        topic = NvoTopic(code=f"t{slot}", name=f"T{slot}")
        db.add(topic)
        db.flush()
        db.add(NvoProblem(
            topic_id=topic.id, external_ref=f"s{slot}", slot_number=slot,
            answer_format="open" if slot in open_slots else "mcq",
            statement=f"q{slot}",
            options_json=None if slot in open_slots else json.dumps(["А", "Б", "В", "Г"]),
            correct_answer_json=json.dumps(["a"]) if slot in open_slots else json.dumps("А"),
            difficulty="easy",
        ))
    db.commit()

    catalog, source = _load_catalog_or_db()
    assert source == "db"
    slot1_sources = {v["source"] for v in catalog["slots"]["1"]["variants"]}
    assert "c" in slot1_sources
    assert not {"a", "b"} <= slot1_sources  # near-duplicates a & b collapse to one
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_generation_retrieval_integration.py -v`
Expected: FAIL — `test_embedding_flag_on_deduplicates_near_identical_variants` finds all 3 variants present (no dedup applied yet); the other two new tests should already pass since the flag is currently unused.

- [ ] **Step 3: Write minimal implementation**

Append to `backend/app/services/nvo_content_retrieval.py`:

```python
def select_diverse_pool_for_slot(
    db: Session, candidates: list[NvoProblem], pool_size: int = 3
) -> list[NvoProblem]:
    """Rank a slot's candidates against their own centroid embedding and
    diversity-filter them, returning a curated pool the caller can still pick
    randomly from.

    There is no free-text user query in NVO generation to rank against, so
    the "query" is the pool's own centroid — this keeps the most
    representative, least-redundant variants and drops near-duplicates,
    without an extra embedding call at generation time (offline embeddings
    only, per the plan's latency risk mitigation).
    """
    embeddings = {
        row.problem_id: json.loads(row.embedding_json)
        for row in db.query(NvoProblemEmbedding)
        .filter(NvoProblemEmbedding.problem_id.in_([c.id for c in candidates]))
        .all()
    }
    if len(embeddings) < 2:
        return candidates  # not enough signal to rank/dedupe meaningfully

    dimension = len(next(iter(embeddings.values())))
    centroid = [
        sum(vec[i] for vec in embeddings.values()) / len(embeddings)
        for i in range(dimension)
    ]

    embedded_candidates = [c for c in candidates if c.id in embeddings]
    unembedded = [c for c in candidates if c.id not in embeddings]

    ranked = rank_by_similarity(db, embedded_candidates, centroid)
    diverse = apply_diversity_filter(ranked, k=min(pool_size, len(embedded_candidates)))
    return diverse + unembedded
```

Modify `backend/app/routers/nvo.py` — add `select_diverse_pool_for_slot` to the existing `from app.services.nvo_content_retrieval import ...` line, then update `_load_catalog_or_db`:

```python
def _load_catalog_or_db() -> tuple[dict, str]:
    if settings.NVO_USE_DB_RETRIEVAL:
        db = SessionLocal()
        try:
            pool = build_slot_pool(db, list(range(1, 24)))
            if pool is not None:
                if settings.NVO_USE_EMBEDDING_RETRIEVAL:
                    pool = {
                        slot: select_diverse_pool_for_slot(db, candidates)
                        for slot, candidates in pool.items()
                    }
                return slot_pool_to_catalog(db, pool), "db"
        except Exception:
            logger.exception("NVO DB retrieval failed; falling back to file catalog")
        finally:
            db.close()
    return load_nvo_catalog(), "file_catalog"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_generation_retrieval_integration.py tests/test_nvo_content_retrieval.py tests/test_nvo_generation.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/nvo_content_retrieval.py backend/app/routers/nvo.py backend/tests/test_nvo_generation_retrieval_integration.py
git commit -m "feat: wire embedding-based diversity ranking into NVO generation (Phase 4)"
```

---

## Task 10: Retrieval quality/latency self-check report (Phase 4 wrap-up)

**Files:**
- Create: `backend/app/services/nvo_content_benchmark.py`
- Test: `backend/tests/test_nvo_content_benchmark.py`

**Interfaces:**
- Consumes: `qa_report` (Task 4), `build_slot_pool` (Task 2).
- Produces: `benchmark_retrieval(db, iterations=5) -> dict` with keys `corpus_ready`, `missing_slots`, `integrity_issue_count`, `latency_ms` (`{"p50": float, "p95": float}`).

Implements the spec's Phase 4 item "evaluate latency and retrieval precision" as a single operator-runnable report rather than a metrics dashboard (out of scope — see the plan's minimal-implementation-checklist item 6, deferred until there's an operator who needs one).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_nvo_content_benchmark.py
import json

from app.models.nvo_content import NvoProblem, NvoTopic
from app.services.nvo_content_benchmark import benchmark_retrieval


def test_benchmark_reports_readiness_and_latency(db):
    open_slots = {21, 22, 23}
    for slot in range(1, 24):
        topic = NvoTopic(code=f"t{slot}", name=f"T{slot}")
        db.add(topic)
        db.flush()
        db.add(NvoProblem(
            topic_id=topic.id, external_ref=f"s{slot}", slot_number=slot,
            answer_format="open" if slot in open_slots else "mcq",
            statement=f"q{slot}",
            options_json=None if slot in open_slots else json.dumps(["А", "Б", "В", "Г"]),
            correct_answer_json=json.dumps(["a"]) if slot in open_slots else json.dumps("А"),
            difficulty="easy",
        ))
    db.commit()

    report = benchmark_retrieval(db, iterations=3)

    assert report["corpus_ready"] is True
    assert report["missing_slots"] == []
    assert "p50" in report["latency_ms"]
    assert "p95" in report["latency_ms"]
    assert report["latency_ms"]["p50"] >= 0


def test_benchmark_flags_incomplete_corpus(db):
    report = benchmark_retrieval(db, iterations=2)
    assert report["corpus_ready"] is False
    assert len(report["missing_slots"]) == 23
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_nvo_content_benchmark.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.nvo_content_benchmark'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/nvo_content_benchmark.py
"""Lightweight retrieval benchmark for the NVO content pipeline (Phase 4 wrap-up).

Not a metrics dashboard (out of scope — see NVO_CONTENT_ARCHITECTURE_PLAN.md's
minimal-implementation-checklist item 6, deferred until there's an operator
who needs one). Gives a single JSON-able report an operator can run before
flipping NVO_USE_DB_RETRIEVAL / NVO_USE_EMBEDDING_RETRIEVAL on in production.
"""
from __future__ import annotations

import time

from sqlalchemy.orm import Session

from app.services.nvo_content_qa import qa_report
from app.services.nvo_content_retrieval import build_slot_pool


def benchmark_retrieval(db: Session, iterations: int = 5) -> dict:
    quality = qa_report(db)

    durations_ms = []
    for _ in range(iterations):
        start = time.perf_counter()
        build_slot_pool(db, list(range(1, 24)))
        durations_ms.append((time.perf_counter() - start) * 1000)

    durations_ms.sort()
    p50 = durations_ms[len(durations_ms) // 2]
    p95_index = min(len(durations_ms) - 1, int(len(durations_ms) * 0.95))

    return {
        "corpus_ready": quality["is_generation_ready"],
        "missing_slots": quality["missing_slots"],
        "integrity_issue_count": len(quality["integrity_issues"]),
        "latency_ms": {"p50": round(p50, 2), "p95": round(durations_ms[p95_index], 2)},
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_nvo_content_benchmark.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/nvo_content_benchmark.py backend/tests/test_nvo_content_benchmark.py
git commit -m "feat: add NVO retrieval readiness/latency benchmark report (Phase 4)"
```

---

## Final verification

- [ ] Run the full backend suite: `cd backend && python -m pytest -v`
- [ ] Expected: all tests pass, including every pre-existing test file (`test_nvo_generation.py`, `test_migrations.py`, `test_nvo_exam_store.py`, etc.) — this plan must not change file-catalog behavior when both flags stay at their default `False`.
- [ ] Manually run the backfill against the real catalog once, outside the test suite, before ever setting `NVO_USE_DB_RETRIEVAL=True` anywhere real: `cd backend && python -m app.services.nvo_content_backfill`, then `python -c "from app.database import SessionLocal; from app.services.nvo_content_qa import qa_report; print(qa_report(SessionLocal()))"` to confirm `is_generation_ready` is `True`.
