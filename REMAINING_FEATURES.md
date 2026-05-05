# Remaining Features (Not Implemented Yet)

This file includes only the requests you mentioned earlier that are still pending.

## 1. Saved Problems System (Practice + NVO)
- Add "Save problem" action on individual practice problems.
- Add "Save problem" action on NVO questions.
- Add a "Saved Problems" button in the right-side bottom popup/jump bar.
- Build a Saved Problems view/list with:
  - Problem content preview
  - Origin of saving (practice lesson / NVO exam + question number)
  - Date and time saved
- Allow opening saved problems directly from that list.

## 2. NVO Exam Flow Lock on Refresh
- If an NVO exam is in progress, refreshing should restore and keep user inside the active exam flow.
- Prevent dropping back to start/new-exam screen while an unfinished exam session exists.

## 3. NVO Modes: Full + Shortened
- Add a shortened NVO mode button (fewer questions + reduced timer).
- Keep current full mode as default/standard.
- Ensure mode metadata is saved in exam history.

## 4. NVO Difficulty Selector + XP Multipliers
- Add difficulty selector before starting NVO:
  - Easy = 0.5x XP
  - Normal = 1x XP
  - Hard = 2x XP
- Use normal mode as closest to real NVO style.
- Easy mode should simplify question set.
- Hard mode should increase challenge level.

## 5. NVO History Improvements
- Mark unfinished exams with flair/status: "Недовършен".
- Keep and show last 10 NVO attempts.
- Add "Review attempt" capability for each of last 10 attempts.
- In review mode show:
  - User answers
  - Correct answers
  - Mistakes per question
  - (If available) scoring breakdown by module/question

## 6. Mission-to-Practice Routing Quality (Follow-up hardening)
- Ensure every daily mission route always opens directly into the intended problem set.
- For each mission, verify lesson/topic/difficulty constraints are consistent with mission definition in UI and backend tracking.

## 7. Data Migration / Schema Hardening
- Add proper DB migration for legacy badge schema mismatch (instead of runtime fallback only), so `user_badges.badge_key` is guaranteed in all environments.
