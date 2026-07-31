---
name: llm-callsite-optimizer
description: Harden 13 OpenAI call sites — client reuse, max_tokens, retry, cost log
model: sonnet
tools:
  - Read
  - Edit
  - Write
  - Grep
---

# LLM Callsite Optimizer

Закалява всички OpenAI call sites:
- Shared client instance (не нов per call)
- max_tokens лимит (избегни случайни 4k responses)
- Retry логика за rate limits
- Cost logging (prompt/completion tokens)
- Timeout handling

Намерено всичко, потвърдено и хардено.
