# NVO figure coverage: audit the thirteen papers, fill the gaps

Status: approved 2026-09-21. Supersedes nothing.

---

## The question this answers

`scene.py` already treats a figure as data rather than a component: named points
in viewBox coordinates plus the marks to draw on them, rendered by one client
component, `SceneRenderer.tsx`. Nine sampled layout builders, seven scene kinds,
and 95 registered item templates of which roughly 41 emit a scene (29 in
`templates/geometry.py`, 10 in `templates/data.py`).

So the architecture for "the generator plugs values into a diagram template" is
not missing. What is missing is **evidence about coverage**. Nobody has
systematically compared the figures that actually appear in the thirteen
official papers in `NVOS/` (2015–2026) against the set `scene.py` can express.

This work produces that comparison, then closes the gaps it finds.

## What it is not

Not a rewrite of `scene.py`. The existing figure layer — sampled layouts with
declared invariant contracts, similarity posing in `to_spec`, `geometry_hash`
de-duplication, the guardrails in `verify.py` — is the right design and stays.
New archetypes are added in its idiom.

---

## Scope decisions (settled, not open)

| Decision | Value | Reason |
|---|---|---|
| Corpus | all 13 papers, 2015–2026 | the existing blueprints were derived from the same 13; a narrower corpus would answer a different question |
| Build bar | archetype recurs in **2 or more** papers | one-off composites cost a full layout builder and would generate one item ever |
| One-offs | catalogued and flagged, not built | they are candidates for the curated `part2_bank.py`, where hand-authoring is already the accepted trade |
| Rasteriser | `pymupdf`, agent venv only | an analysis tool, not a server runtime dependency; it must not enter `requirements.txt` |
| Isolation | git worktree | the branch `nvo-history-mobile-persistence-fixes` carries uncommitted work in the exact files this touches |

---

## Architecture

Five phases. Phases 1–3 are read-only research and end at a checkpoint; phase 4
is the only one that changes generator code.

```
NVOS/*.pdf
    │
    │  phase 1  extract_nvo_figures.py (pymupdf)
    ▼
docs/nvo-figures/
    ├── crops/{paper}_{page}_{item}.png     one image per detected figure
    └── inventory.json                      provenance + stem text + key text
    │
    │  phase 2  visual classification, batched
    ▼
archetype tags  ──────┐
                      │  phase 3  diff against the template registry
scene.py builders ────┤
templates/*.py    ────┘
    ▼
docs/nvo-figures/coverage.md      archetype x paper matrix
                                  build list, ranked by recurrence
    │
    ▼  ==== CHECKPOINT: user chooses how much of the build list to take ====
    │
    │  phase 4  new @layout builders + @template items
    ▼
scene.py, templates/geometry.py, tests
    │
    │  phase 5  contact sheet -> Playwright screenshot -> side-by-side diff
    ▼
visual confirmation against the original crops
```

### Phase 1 — extract

A throwaway script, `scripts/extract_nvo_figures.py`, not shipped with the
server. For each page it asks pymupdf for vector drawing rectangles
(`page.get_drawings()`) and embedded image blocks, clusters rectangles that
overlap or sit within a small gutter of each other into one figure, and crops
the union box with padding.

Each crop is written as `{paper_slug}_{page:02d}_{n}.png` at 200 dpi, and an
entry lands in `inventory.json`:

```json
{
  "crop": "nvo2026_04_1.png",
  "paper": "nvo26_matematika_7klasotgovori_19062026",
  "year": 2026,
  "page": 4,
  "bbox": [72.0, 310.5, 288.0, 455.2],
  "stem": "Bulgarian text of the nearest preceding question",
  "item_no": 11,
  "has_key": true
}
```

**Why the stem matters.** An archetype is defined as much by what is asked as by
what is drawn. A triangle with one cevian is a different template depending on
whether the cevian is a median, an altitude or a bisector, and the picture alone
does not say which. Classification reads both.

### Phase 2 — classify

The crops are read visually in batches, each alongside its stem, and tagged with
an archetype slug in the existing naming idiom (`triangle_cevian_median`,
`parallelogram_diagonals`, `circle_inscribed_angle`, `grouped_bars`,
`solid_prism_net`). Tags accumulate into `archetypes.json`, recording for each
archetype the set of papers it appears in and the crops that evidence it.

### Phase 3 — diff

Each archetype is mapped to the `scene.py` builder and the item template(s) that
can express it, or marked uncovered. Coverage is asserted by construction, not
assumed: an archetype counts as covered only when a named template is shown to
produce it.

Output `docs/nvo-figures/coverage.md`:

* archetype x paper matrix, thirteen columns
* covered set, with the template that covers each
* build list — uncovered and recurring in 2+ papers — ranked by recurrence
* catalogue-only set — uncovered one-offs, flagged as `part2_bank.py` candidates

This is the checkpoint. Phase 4's size is unknown until this report exists, so
the user decides how much of the build list to take rather than committing to
all of it in advance.

### Phase 4 — fill

Per archetype on the accepted build list:

1. A layout builder in `scene.py` decorated with `@layout(invariants=[...])`.
   The contract is **predicates, not a docstring** — this is the failure the
   existing code already learned from, where `scalene_triangle()` at 87.9° put a
   perpendicular foot on top of a vertex and `triangle_for_cevians()` had to be
   added to recover.
2. Item templates in `templates/geometry.py` (or `data.py`), each declaring
   `topics`, `kinds`, `weight`, `band` and a `signature`.
3. Parameter pools sized through `slot.profile.tier(...)` so the archetype
   participates in difficulty rather than generating identical numbers at every
   level.
4. `Retry` on a bad draw, never rounding.

### Phase 5 — verify visually

Regenerate the contact sheet through the existing harness
(`SceneRenderer.contactsheet.test.tsx`, driven by `SCENES_JSON` / `SCENES_HTML`),
screenshot it with Playwright, and place generated figures beside the original
crops that motivated them. This is the step that catches a figure which
satisfies every predicate and still reads wrong to a human.

---

## Error handling

| Failure | Handling |
|---|---|
| Vector clustering merges two adjacent figures, or splits one | per-page fallback: rasterise the whole page and read it directly; the inventory records `detection: "manual"` for that entry |
| A paper is a scanned image rather than vector art | no drawings are returned; the page falls back to full-page rasterisation |
| An answer-key paper duplicates figures from its question pages | de-duplicated by `(year, item_no)`; key crops only supplement a missing question crop |
| A new layout cannot satisfy its invariants | raises `LayoutError`, already a `Retry`; the assembler resamples rather than failing the paper |
| A new template's distractor pool sits outside the plausibility band | `numeric_options` raises `DistractorError`; caught by the existing `test_every_registered_template_can_actually_build_something` |

---

## Testing

Phases 1–3 produce documents, and their correctness is checked by inspection of
the report against the crops it cites.

Phase 4 is defended by the suite that already exists, plus additions:

* every new layout's invariant contract asserted directly, in the idiom of the
  existing layout tests — the contract must fail in CI, not in a docstring
* `test_five_hundred_papers_generate_without_a_single_failure` stays green
* `geometry_hash` collision checks — two templates must not draw the same
  picture, a bug that previously fired on half of all generated papers
* `test_every_slot_has_several_templates_to_choose_between` — the floor of three
  must not regress, and should rise where the build list feeds a thin slot
* `test_every_registered_template_can_actually_build_something` — catches a
  template whose every draw is rejected

---

## Deliverables

| Path | Phase | Kind |
|---|---|---|
| `scripts/extract_nvo_figures.py` | 1 | throwaway analysis script |
| `docs/nvo-figures/crops/*.png` | 1 | evidence |
| `docs/nvo-figures/inventory.json` | 1 | evidence |
| `docs/nvo-figures/archetypes.json` | 2 | evidence |
| `docs/nvo-figures/coverage.md` | 3 | **the checkpoint deliverable** |
| `backend/app/nvo_gen/scene.py` | 4 | new layout builders |
| `backend/app/nvo_gen/templates/geometry.py` | 4 | new item templates |
| `backend/tests/` | 4 | invariant contracts |
| contact-sheet screenshots | 5 | visual confirmation |
