# Ideon

Ideon is an adaptive AI partner for university research ideation. Parts 1–3 are integrated: the responsive participant UI, controlled collaboration pipeline, and persistent Supabase research-management system.

## Local setup

Requirements: Node.js 20.9 or newer.

1. Copy `.env.example` to `.env.local`.
2. Set `GEMINI_API_KEY` (or `OPENAI_API_KEY`), `SUPABASE_PUBLISHABLE_KEY`, and the server-only `SUPABASE_SERVICE_ROLE_KEY`. Gemini defaults to `gemini-3.6-flash`; set `GEMINI_MODEL` only when you intentionally need a different supported model.
3. Run `npm.cmd run dev` on Windows, or `npm run dev` on macOS/Linux.
4. Open `http://localhost:5173/study/consent`.

Do not use Live Server: this is a server-rendered Next.js application whose API routes, environment variables, AI calls, and Supabase operations require the development server.

Never put either server credential in a `NEXT_PUBLIC_` variable or client component. Participant access uses an opaque local resume token; only its SHA-256 hash is stored in Supabase.

## Research architecture

Each successful turn follows this sequence:

```text
participant token validation
  -> load condition, config, context, and transcript from Supabase
  -> explicit intent detector
  -> state analyzer (adaptive condition only)
  -> strategy manager
  -> versioned explore/deepen prompt
  -> configured Gemini or OpenAI API
  -> transactional Supabase turn record
```

Condition and configuration come from the database, never from participant input. Failed generations are logged separately. Final ideas auto-save, questionnaire answers persist, and the authenticated research console reads real RLS-protected data. Analysis-ready CSV endpoints cover sessions, transcripts, strategies, idea events, final ideas, and questionnaire records under `/api/admin/export/`.

Database migrations are stored in `supabase/migrations/` and have been applied to Supabase project `Ai-chat` (`wxmxnahytjrlailgjxvq`).

## Deploy to Vercel

1. Import `https://github.com/the-mrovi/Ideon` in Vercel. Vercel will detect Next.js automatically.
2. Add `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `IDEON_STUDY_PHASE` under Project Settings → Environment Variables.
3. Keep `NEXT_PUBLIC_IDEON_DEBUG_INSPECTOR=false` for production.
4. Deploy. No custom build command, output directory, or root-directory override is required.

Never add `.env.local` or any service-role/API key to GitHub.

## Create the first researcher

1. In the Supabase dashboard, create a user under Authentication → Users.
2. Copy that user's UUID.
3. Run this in the Supabase SQL editor, replacing the UUID and name:

```sql
insert into public.admin_profiles (auth_user_id, role, display_name)
values ('USER_UUID', 'admin', 'Research administrator');
```

The user can then sign in at `/admin`. Researchers have read access; admins can additionally freeze/activate configurations and delete development or pilot sessions. Main-study deletion is blocked in the database.

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
```

The migration SQL is version-controlled. Before moving from development to main data collection, create a main-phase configuration, review its model/prompt/task/questionnaire versions, freeze it, then activate it from the admin console.
