# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

永恒档案 (EverArchive) - AI-driven biographical knowledge graph system. Users record audio answers to life questions, which are transcribed and processed into structured biography outlines with knowledge graph integration.

**Tech Stack**: Next.js 16 + React 19 + TypeScript + Supabase (PostgreSQL + Edge Functions/Deno) + Gemini 2.0 Flash + Tailwind CSS 4

## Commands

```bash
npm run dev      # Start dev server at localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint

# Supabase Edge Functions
supabase functions deploy <function-name>
supabase functions logs <function-name> --tail
supabase secrets set GEMINI_API_KEY=<key>
supabase db push  # Apply migrations
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│     Next.js Frontend (app/ directory - App Router)          │
│     Pages: Dashboard, Timeline, Family, Places, Photos      │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Supabase Backend                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ Edge Functions (Deno):                                 │ │
│  │ • transcribe_session - Audio → transcript              │ │
│  │ • generate_biography_outline - Transcripts → outline   │ │
│  │ • expand_biography_chapters - Outline → full prose     │ │
│  │ • analyze_content_gaps, send_weekly_reminders          │ │
│  └────────────────────────────────────────────────────────┘ │
│  Database: projects, questions, answer_sessions,            │
│  biography_outlines, people, places, events, photos...      │
│  Storage: Audio files, photos, PDF exports                  │
└─────────────────────────────────────────────────────────────┘
```

### Core Data Flow
1. User records audio → Supabase storage
2. `transcribe_session` converts audio → `answer_sessions.transcript_text`
3. At 100+ answers, `generate_biography_outline` aggregates transcripts → JSONB outline
4. Frontend polls job progress every 3s

### Key Modules
- **Biography Outline**: AI-generated structured outlines with author style customization (Hemingway, Capote, etc.)
- **Knowledge Graph**: People, places, events, memories with relationships and timeline views
- **Photo Management**: Albums, auto-sorting, photo-entity relationships
- **Print/PDF Export**: Professional book layout with print specifications

## Code Patterns

### Supabase Client
Always import from `lib/supabaseClient.ts` - never instantiate directly.

### Edge Functions
- Use `@ts-nocheck` at top (Deno type resolution differs)
- ESM imports from `esm.sh` CDN, not npm packages
- Always include `corsHeaders` for preflight requests (OPTIONS must return 200)
- Service role key required to bypass RLS
- Chunking: 50 sessions/batch to avoid token limits
- Retry: 3 attempts with exponential backoff for Gemini calls

### Components
- State: `useState` only (no Redux/Context)
- Modals: Custom components with backdrop blur
- Toasts: `showToast()` with 2.5s timeout
- All DB calls in try-catch with user-friendly errors

### Database
- All tables use RLS scoped to `owner_id` or `user_id`
- JSONB for flexible data (`outline_json`, `style_prefs_json`)
- `updated_at` auto-updated via trigger
- Foreign keys always use `ON DELETE CASCADE`

## Critical Pitfalls

1. **Question ID is TEXT, not UUID**: `questions.id` uses strings like "chapter1_q1" - always `.eq('question_id', textValue)`
2. **Edge Function CORS**: OPTIONS requests must return immediately with corsHeaders
3. **RLS Bypass**: Edge Functions need service role key for admin operations
4. **Job Polling Interval**: Frontend polls every 3s - don't change without testing

## Testing After Changes

1. `npm run lint` passes
2. Auth flow: signup → auto-create "My Vault" project
3. RLS verification: logout confirms data not accessible
4. Outline generation with <100 and 100+ answered questions
5. Check Edge Function logs: `supabase functions logs <name>`
