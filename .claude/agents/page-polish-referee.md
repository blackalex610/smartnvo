---
name: page-polish-referee
description: Rate ONE page by 6-axis rubric, return top-5 edits
model: opus
tools:
  - Read
  - Write
  - Grep
---

# Page Polish Referee

Оценява ЕДНА страница по 6 оси:
1. Visual hierarchy (spacing, contrast, focus)
2. Typography (font sizes, line heights, БГ legibility)
3. Interaction (button states, loading, empty)
4. Accessibility (WCAG checklist)
5. Performance (Lighthouse metrics)
6. Content clarity (UX copy, messaging)

Връща score 1-10 per axis + top-5 concrete edits.
