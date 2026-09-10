# Ideon

Ideon is an adaptive AI partner for university research ideation. This repository contains the complete Part 1 participant/admin interface and the Part 2 controlled collaboration pipeline.

## Local setup

Requirements: Node.js 22.13 or newer.

1. Copy `.env.example` to `.env.local`.
2. Add a server-side `OPENAI_API_KEY`.
3. Run `npm.cmd run dev` on Windows, or `npm run dev` on macOS/Linux.
4. Open `http://localhost:5173/study/chat`.

Never put the API key in a `NEXT_PUBLIC_` variable or client component.

## Part 2 architecture

Each turn follows this controlled sequence:

```text
POST /api/chat
  -> explicit intent detector
  -> state analyzer (adaptive condition only)
  -> strategy manager
  -> explore/deepen prompt builder
  -> OpenAI Responses API
  -> in-memory research event sink
```

The three conditions share the same model, response settings, safety instructions, interface, and task. Only strategy selection differs:

- `fixed`: always uses the configured fixed strategy.
- `random`: uses a deterministic seeded 50/50 decision.
- `adaptive`: uses explicit intent, detected user state, confidence thresholds, and anti-flapping rules.

Pilot settings are centralized in `src/ai/experimentConfig.ts`. The experiment uses the frozen `gpt-5.4-mini-2026-03-17` snapshot through the Responses API. Prompt templates and versions are in `src/ai/prompts/`. The provider abstraction is in `src/ai/llmClient.ts`.

The production chat response contains only the normal Ideon answer. Internal state, confidence, strategy, and decision metadata are recorded server-side and are never returned to participants. A debug inspector can be enabled locally with `NEXT_PUBLIC_IDEON_DEBUG_INSPECTOR=true`; the server blocks it in production.

## Verification

```powershell
npm.cmd test
npm.cmd run build
```

The tests cover rule classification, explicit overrides, fixed/random/adaptive separation, seeded reproducibility, confidence switching, anti-flapping, malformed classifier output, and generation failure rollback.

## Part 3 integration

`ResearchEventSink` is the persistence boundary. Replace the in-memory implementation with a Supabase-backed sink in Part 3 without changing the analyzer, strategy manager, prompts, API contract, or participant UI.

No Supabase persistence is implemented in Part 2.
