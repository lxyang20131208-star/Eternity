# Copilot Instructions - Digital Life MVP

## Project Architecture

This is a **Next.js 16 + Supabase** biography creation app where users answer questions and generate AI-powered biography outlines. The app uses **Supabase Edge Functions** (Deno runtime) for serverless compute and **Gemini 2.0 Flash** for AI generation.

### Core Data Flow
1. User records audio answers → uploaded to Supabase storage
2. `transcribe_session` Edge Function converts audio → `answer_sessions.transcript_text`
3. After 100+ answers, `generate_biography_outline` Edge Function aggregates transcripts → structured JSONB outline
4. Frontend polls job progress and displays collapsible outline with quotes

### Key Tables (Supabase)
- `projects`: User biography projects (auto-created as "My Vault")
- `questions`: Question bank with optional `chapter` field
- `answer_sessions`: User audio recordings + transcript_text (references `question_id` as TEXT not UUID)
- `user_question_progress`: Tracks unlocked/completed status per user+question
- `biography_outlines`: Stores generated outlines (JSONB) with versioning
- `outline_jobs`: Job tracking for async outline generation

**Important**: All tables use RLS (Row Level Security) scoped to `owner_id` or `user_id`. Edge Functions bypass RLS using service role keys.

## Development Workflow

### Local Dev
```powershell
npm run dev  # Start Next.js dev server on port 3000
```

### Supabase Edge Functions
```powershell
# Deploy a function
supabase functions deploy <function-name>

# View logs
supabase functions logs <function-name>

# Set secrets (required: GEMINI_API_KEY)
supabase secrets set GEMINI_API_KEY=your_key
```

### Database Migrations
```powershell
supabase db push  # Apply migrations from supabase/migrations/
```

### Automated Deploy
Use [deploy-biography-outline.ps1](code/digital-life-mvp/deploy-biography-outline.ps1) for one-command deployment (migration + secrets + function deploy).

## Code Conventions

### TypeScript Patterns
- **Supabase Client**: Import from `lib/supabaseClient.ts` - never instantiate directly
- **Edge Functions**: Use `@ts-nocheck` at top (Deno type resolution differs from Node)
- **Type Interfaces**: Define shared types in lib files (e.g., `StylePrefs`, `OutlineJSON` in [lib/biographyOutlineApi.ts](code/digital-life-mvp/lib/biographyOutlineApi.ts))

### Component Patterns ([app/page.tsx](code/digital-life-mvp/app/page.tsx))
- **State Management**: Use `useState` for all UI state (no Redux/Context)
- **Modals**: Custom modal components with backdrop blur (see `Modal`, `ConfirmDialog`)
- **Toast Notifications**: Custom `showToast()` function with 2.5s timeout
- **Async Patterns**: All DB calls wrapped in try-catch with user-friendly error messages

### Edge Function Patterns
- **CORS Headers**: Always include `corsHeaders` object for preflight requests
- **Auth**: Extract user from `Authorization: Bearer <token>` header via `supabase.auth.getUser()`
- **Chunking**: Large datasets split into batches (50 sessions/chunk) to avoid token limits
- **Retry Logic**: 3 attempts with exponential backoff for external API calls (Gemini)
- **Job Updates**: Use `SET` queries to update `progress_percent` in real-time

### Database Conventions
- **RLS Policies**: All user-scoped tables check `auth.uid() = owner_id` or similar
- **JSONB Columns**: Use JSONB for flexible data (e.g., `outline_json`, `style_prefs_json`)
- **Triggers**: `updated_at` auto-updated via `updated_at_trigger()` function
- **Foreign Keys**: Always use `ON DELETE CASCADE` for dependent data

## Critical Integration Points

### Gemini API ([supabase/functions/generate_biography_outline/index.ts](code/digital-life-mvp/supabase/functions/generate_biography_outline/index.ts))
- **Model**: `gemini-2.0-flash-exp` (set via `GEMINI_MODEL` secret, default in code)
- **Prompt Engineering**: 
  - Converts transcripts to structured JSON outline
  - Supports style preferences: tone (professional/casual/narrative), depth (brief/detailed/comprehensive)
  - Language rule: `convert-Chinese-to-Simplified` normalizes Chinese text
- **Response Format**: Must return valid JSON with `{ sections: [...] }` structure

### Supabase Storage
- **Bucket**: User audio stored in Supabase storage (check [supabase/config.toml](code/digital-life-mvp/supabase/config.toml) for bucket config)
- **Paths**: Audio files referenced via `audio_object_key` in `answer_sessions`

## Common Pitfalls

1. **Question ID Type Mismatch**: `questions.id` is TEXT (e.g., "chapter1_q1"), not UUID - always use `.eq('question_id', textValue)`
2. **Edge Function Imports**: Use ESM imports from `esm.sh` CDN, not npm packages
3. **RLS Bypass**: Edge Functions need service role key to bypass RLS - never use anon key for admin operations
4. **CORS in Edge Functions**: OPTIONS requests must return 200 with `corsHeaders` immediately
5. **Job Polling**: Frontend polls every 3s ([app/page.tsx#L500-550](code/digital-life-mvp/app/page.tsx#L500-L550)) - don't change interval without testing

## Testing Checklist

After making changes:
1. Check `npm run lint` passes
2. Test auth flow: signup → auto-create "My Vault" project
3. Verify RLS: logout and confirm data not accessible
4. Test outline generation with <100 and 100+ answered questions
5. Check Edge Function logs for errors: `supabase functions logs <name>`

## Documentation References
- Main docs: [BIOGRAPHY_OUTLINE_SUMMARY.md](code/digital-life-mvp/BIOGRAPHY_OUTLINE_SUMMARY.md)
- Deploy guide: [BIOGRAPHY_OUTLINE_DEPLOYMENT.md](code/digital-life-mvp/BIOGRAPHY_OUTLINE_DEPLOYMENT.md)
- Quick ref: [QUICK_REFERENCE.md](code/digital-life-mvp/QUICK_REFERENCE.md)
