# Saved Problems (Запазени задачи) — Design

**Date:** 2026-09-20
**Status:** Approved, ready for implementation plan
**Backlog item:** `REMAINING_FEATURES.md` §1 — the largest remaining product gap

## Purpose

A signed-in student can bookmark an individual practice exercise or an individual
NVO exam question, then later open a list of everything they saved and review it.
This is a revision tool: the problems a student flags are the ones they found hard,
and today there is no way to come back to them.

## The constraint that shapes the design

The two sources are not symmetric.

A practice exercise is a durable database row — `Exercise.id`
(`backend/app/models/curriculum.py:66-73`) is a real primary key that survives
reloads, and even AI-generated exercises are persisted and cached server-side.

An NVO question is not. `question.id` in `NVOPracticeExamPage.tsx` is merely the
ordinal within a generated exam (1–23 full, 1–16 short; see `convertExamQuestions`
which sets `id: q.number`). There is no server-side question row id on the wire, and
the generated exam itself is evicted from `nvo_exam_store` after 24 hours. The exam
page already documents the consequence for its own history feature: `canReview(entry)`
in `frontend/src/utils/nvoHistory.ts` is literally `entry.questions.length > 0`,
because a synthesized history entry has no questions to show.

So a saved NVO question cannot be a pointer. Within 24 hours it would become a dead
entry, which is precisely the case where saving matters most — the student saved it
because they want to come back to it *later*.

**Therefore: snapshot, not reference.** The full problem payload is copied into the
saved row at save time. This costs ~1–2KB per row and means a later correction to a
source problem does not propagate to copies already saved. Both are accepted.

Snapshotting uniformly (rather than referencing exercises and snapshotting NVO) is a
deliberate choice for one code path over storage optimality. A discriminated model
with a nullable FK on one arm and a nullable payload on the other would double the
branching in the model, the service, the API response and the renderer, to save a
few hundred kilobytes.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Storage | Snapshot the full problem | Only option that survives the 24h NVO TTL |
| Reopen UX | Read-only review | No change to the exercise engine; smallest surface that delivers the value |
| Access | Free, capped at 200/user | A study tool, not a monetizable feature; the cap only bounds storage |
| Guests | Allowed | Guests are ordinary user rows with real JWTs; `get_current_user` covers them for free |

On guests: registering the table in `USER_OWNED_TABLES` makes a saved problem count
as activity in `guest_cleanup.purge_stale_guests`, so saving something actively
protects a guest from being reaped. A guest who never registers still loses their
saves eventually; that is the existing, accepted behaviour for all guest data.

## Normalized snapshot schema

The central architectural idea. Both sources converge on one shape, so the saved
problems page needs exactly one renderer rather than a branch per source.

```jsonc
{
  "kind": "exercise" | "nvo",
  "question": "string",                  // statement, LaTeX-capable
  "answer_type": "multiple_choice" | "numeric" | "algebra" | "open",
  "options": [{ "key": "А", "text": "..." }] | null,
  "correct_answer": "string" | ["string"] | null,
  "solution": "string" | null,
  "diagram": { "type": "string", "config": {} } | null,
  "user_answer": "string" | null,        // what the student had entered when they saved
  "origin": {
    // kind == "exercise"
    "lesson_id": 12, "lesson_title": "...", "difficulty": "medium",
    // kind == "nvo"
    "exam_id": "...", "question_number": 7, "module": 1, "topic": "..."
  }
}
```

The `origin` block carries whatever the list view needs to render the
"origin of saving" line the backlog asks for. It lives inside the snapshot rather
than in typed columns because nothing in the feature queries by lesson or exam — the
only filter is by source, and that is a real column.

The backend stores this as an opaque JSON string and does not validate its interior
beyond requiring `question` to be a non-empty string. Schema drift in the snapshot is
a frontend concern; the renderer treats every field but `question` as optional.

## Data model

One table, `saved_problems`, following the `NvoAttempt` template
(`backend/app/models/nvo_exam.py:62-84`) exactly.

| Column | Type | Notes |
|---|---|---|
| `id` | Integer | PK, `index=True` |
| `user_id` | Integer | not null, indexed, **no ForeignKey** |
| `source` | String(16) | `'exercise'` \| `'nvo'` |
| `source_ref` | String(128) | dedupe key |
| `snapshot_json` | Text | the normalized snapshot |
| `created_at` | DateTime | naive, `default=datetime.utcnow`, not null |

```python
__table_args__ = (
    UniqueConstraint("user_id", "source", "source_ref", name="uq_saved_problem_user_source_ref"),
)
```

Conventions being followed, each deliberate rather than incidental:

- **No FK on `user_id`.** `backend/app/models/classroom.py:36-38` states the rule:
  no user FK anywhere in this schema; erasure is explicit in `services/user_data.py`.
- **`Text` + manual `json.dumps`/`json.loads`, not a `JSON` column.** Every payload
  column in the repo does this (`event_log.py:25`, `mobile_channel.py:38`), for
  SQLite/Postgres portability. Column name ends in `_json`.
- **Naive `DateTime` with `datetime.utcnow`,** no `timezone=True` anywhere in the repo.
- **No `expires_at`.** TTL columns exist only on cache-style tables; this is real user
  data and does not expire.
- **Legacy `Column(...)` style,** not `Mapped[]`/`mapped_column`, matching every
  existing model despite SQLAlchemy 2.0.

### `source_ref` format

| source | value | example |
|---|---|---|
| `exercise` | `str(exercise_id)` | `"4271"` |
| `nvo` | `f"{exam_id}:{question_number}"` | `"3f9a...c2:7"` |

A single non-null string rather than a nullable composite key. A composite unique
constraint over nullable `exercise_id` / `exam_id` / `question_number` columns would
silently fail to dedupe, because SQL treats NULLs as distinct — two saves of the same
exercise would both be accepted. The string key makes the constraint actually work on
both SQLite and Postgres.

## API

`backend/app/routers/saved_problems.py`, `APIRouter(prefix="/saved-problems", tags=["saved-problems"])`,
thin over `backend/app/services/saved_problems.py`. Every endpoint takes
`current_user: User = Depends(get_current_user)` and scopes on `current_user.id`.
No metering dependency — saving is free.

### `POST /saved-problems` → 201 created, 200 already saved

```jsonc
// request
{ "source": "nvo", "source_ref": "3f9a...c2:7", "snapshot": { /* normalized snapshot */ } }
// response: the saved row (see GET)
```

Idempotent. Re-saving an existing `(user_id, source, source_ref)` returns the existing
row with 200 rather than erroring, via the `IntegrityError` → `db.rollback()` → re-query
pattern at `classroom_service.py:123-129`. This matters because the bookmark button is
a toggle and double-clicks are routine.

Rejects with 409 and a Bulgarian message when the user is already at the cap.

### `GET /saved-problems?limit=20&source=` → 200

Newest first, `order_by(created_at.desc(), id.desc())` — the tiebreaker column is
included on purpose, matching `GET /nvo/attempts`. `source` optionally filters to one
kind. Limit clamped exactly as the repo does:

```python
SAVED_PROBLEMS_DEFAULT_LIMIT = 20
SAVED_PROBLEMS_MAX_LIMIT = 100
safe_limit = max(1, min(int(limit), SAVED_PROBLEMS_MAX_LIMIT))
```

Each item: `{ id, source, source_ref, snapshot, created_at }` where `snapshot` is the
parsed object and `created_at` is hand-serialized with `.isoformat()` into a `str`
field, per `NVOAttemptSummary`.

### `GET /saved-problems/refs` → 200

```jsonc
{ "refs": { "exercise:4271": 12, "nvo:3f9a...c2:7": 15 } }
```

A map from `"{source}:{source_ref}"` to the saved row's id, covering everything the
user owns. This exists so bookmark buttons render the correct on/off state: a lesson
page shows many exercises at once, and without this each button would need its own
lookup. One short response (≤200 entries at the cap) fills a client-side map that
every button reads from.

It returns the **id**, not just the ref string, so that un-saving needs no extra
round trip — the button knows `(source, source_ref)` but `DELETE` is keyed by id.

### `DELETE /saved-problems/{saved_id}` → 204

Scoped on `current_user.id`. Returns **404, not 403**, when the row belongs to someone
else — matching `classroom_service.py:76-88`, which does this to avoid confirming that
an id exists.

### Cap

`SAVED_PROBLEMS_MAX_PER_USER = 200`, enforced in the service before insert.

## Frontend

No React Query, SWR or Zustand exists in this codebase — server data is
`useState` + `useEffect` + a service call, with manual `loading`/`error` state.
New work follows that.

| File | Role |
|---|---|
| `frontend/src/services/savedProblems.ts` | Typed calls, `export async function` style matching `services/nvo.ts` |
| `frontend/src/context/SavedProblemsContext.tsx` | Holds the ref `Set` + `save`/`unsave`; fetches `/refs` once for a signed-in user |
| `frontend/src/components/SaveProblemButton.tsx` | The bookmark toggle, used by both save surfaces |
| `frontend/src/pages/SavedProblemsPage.tsx` | The list + read-only review |

A context rather than per-page fetching: there are two save surfaces plus the list
page, all of which must agree on whether a given problem is saved. The repo already
composes five contexts in `App.tsx`, so this is the established shape.

### Integration points

Both slots already exist and need no layout change:

- **`ExercisesPage.tsx:270-296`** — the card header row is `flex items-center justify-between`
  with a left group and an *empty right side*. The button drops in at `:295`.
- **`NVOPracticeExamPage.tsx:1720-1739`** — the question header's right-hand cluster
  already holds the "Маркирай за преглед" toggle, an id-keyed per-question control with
  active/inactive styling to copy. The bookmark sits beside it.

Also: a lazy route `saved` inside the `<Route element={<RequireAuth />}>` block
(`App.tsx:70-87`), a `NAV_ITEMS` entry in `AppNavbar.tsx:69-74`, and a
`shortcutItems` entry in `ChatSidebar.tsx` — that quick-actions block in the
right-side popup is what the backlog means by "a Saved Problems button in the
right-side bottom popup/jump bar". There is no other dock or jump bar in the app.

### Page construction

`SavedProblemsPage` uses the modern stack — `PageShell`, `PageHeader`, `EmptyState`,
`ErrorState` from `components/app/PageShell.tsx`, design tokens from `index.css`
(`bg-surface`, `text-ink`, `border-line`), and `ui/card` + `ui/button` — while
mirroring the *information architecture* of the NVO history list
(`NVOPracticeExamPage.tsx:1486-1543`): title row with a status pill, a meta grid, and
an action row that degrades to explanatory text rather than a disabled button.

Filter chips: `Всички` / `От упражнения` / `От НВО`. Dates via the `bg-BG` locale
formatter; `formatBgDateTime` is currently module-private to the NVO page and should
be lifted to `frontend/src/utils/` so both use one implementation.

### Bulgarian copy

No i18n library exists; text is written inline in Bulgarian. Icon-only buttons get a
Bulgarian `aria-label`/`title`, since tests query by accessible name.

`Запазени задачи` · `Запази задачата` · `Запазено` · `Премахни от запазените` ·
`От урок` · `От НВО тест • Задача {n}` · `Няма запазени задачи.` ·
`Достигна максимума от 200 запазени задачи. Премахни някои, за да запазиш нови.`

## Registration chores

Four pinning tests fail, loudly or silently, if these are missed:

1. `backend/alembic/env.py:31-39` — import the model module.
   `test_migrations.py:88-106` fails on any model file env.py does not import.
2. `backend/app/main.py` — model import (~:36), router import (~:26),
   `app.include_router(saved_problems_router)` (after :117).
3. `backend/tests/conftest.py:29-36` — import the model in the `_schema` fixture.
4. `backend/app/services/user_data.py:47-56` — add to `USER_OWNED_TABLES`, **and**
   add `"saved_problems"` to the literal set in `test_user_data.py:71-85` plus
   `_populate` at `:52-66`. Omitting this leaves the table neither exported nor
   erased on account deletion, which is a GDPR hole rather than a cosmetic miss.
5. `backend/tests/test_route_auth_matrix.py:87-89` — add all four routes to
   `PERSONAL_DATA_ROUTES` using FastAPI path templates (`/saved-problems/{saved_id}`).

## Migration

`backend/alembic/versions/c9d0e1f2a3b4_saved_problems.py`, `down_revision = "b8c9d0e1f2a3"`
(current chain head, `mobile_channel_state`).

Plain `op.create_table` — `op.batch_alter_table` is required only for `alter_column`
on an existing table, the SQLite limitation that broke the chain once before
(`a1b2c3d4e5f6_guest_users.py:27-35`). A new table needs none. `server_default` on every
non-nullable defaulted column; `created_at` is `nullable=False` with no server default,
supplied Python-side. A separate `op.create_index("ix_saved_problems_user_id", ...)`.
`downgrade()` is the exact mirror. `test_migrations.py:115-152` runs the real chain
against a throwaway SQLite database, so the migration must work there.

## Testing

Test-first. Backend `cd backend && python -m pytest tests/ -v`; frontend
`cd frontend && npm test`.

**`backend/tests/test_saved_problems.py`** — with the autouse cleanup fixture copied
from `test_nvo_attempt_history.py:23-38` (mandatory: no cascading FK means `make_user`
teardown leaves child rows, SQLite reuses ids, and the unique constraint then fires on
an unrelated row).

- saves an exercise problem and reads it back
- saves an NVO question and reads it back
- re-saving the same problem is idempotent and does not duplicate
- never leaks another student's saved problems
- deleting someone else's saved problem returns 404
- rejects a save past the 200 cap
- `source` filter returns only that kind
- limit clamping: default, caller-requested smaller, `limit=0` → 1, `limit=9999` → 100
- `/refs` returns only the caller's refs
- anonymous requests are rejected with 401

**Frontend** — `SaveProblemButton.test.tsx` (toggles, calls the service, correct
Bulgarian accessible name in both states) and `SavedProblemsPage.test.tsx` (renders a
list, empty state, filter chips), mocking the service and `AuthContext` per
`MyDataSection.test.tsx:7-24`.

## Out of scope

- **Re-attempting a saved problem.** Read-only review only. Making a saved problem
  answerable again requires the exercise engine to accept an arbitrary injected
  problem, which is a real refactor of `ExercisesPage`.
- **Cross-device NVO *attempt* review** (`REMAINING_FEATURES.md` priority #4). Related,
  and this feature's snapshot mechanism is evidence the approach works, but the
  storage decision there is about every exam ever sat, not individually flagged
  questions. Separate item.
- **Folders, tags, notes, or spaced repetition** on saved problems. YAGNI.
