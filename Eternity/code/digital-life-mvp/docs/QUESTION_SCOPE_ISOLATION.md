# Question System Scope Isolation

## Overview

This document describes the implementation of question scope isolation to ensure:
1. Trial/draft questions do NOT pollute the main question set
2. User-created questions are private (per-user visibility)
3. Question count displays clearly differentiate core vs custom questions

## Data Model

### `questions` Table Schema

```sql
id TEXT PRIMARY KEY                -- Semantic IDs like 'q001' or UUIDs for custom
text TEXT NOT NULL                 -- Question text
chapter TEXT                       -- Chapter/section grouping
scope TEXT DEFAULT 'global'        -- CHECK ('global', 'user', 'trial')
owner_user_id UUID                 -- NULL for global/trial, user ID for custom
created_by TEXT                    -- 'system', 'ai', or 'user'
```

### Scope Values

| Scope | Description | Visibility | Count |
|-------|-------------|------------|-------|
| `global` | Core questions (the base 100) | All authenticated users | Fixed at 100 |
| `user` | User-created custom questions | Only the owner | Variable per user |
| `trial` | Draft/onboarding questions | Accessible by ID only, excluded from lists | Not counted |

## RLS Policies

```sql
-- SELECT: Users see global + their own user questions
-- Trial questions are accessible but excluded from main queries via .in('scope', ['global', 'user'])
CREATE POLICY "questions_select_policy"
ON questions FOR SELECT TO authenticated
USING (
  scope = 'global'
  OR (scope = 'user' AND owner_user_id = auth.uid())
);

-- INSERT: Users can only create user-scoped questions
CREATE POLICY "questions_insert_policy"
ON questions FOR INSERT TO authenticated
WITH CHECK (scope = 'user' AND owner_user_id = auth.uid());

-- UPDATE/DELETE: Users can only modify their own questions
CREATE POLICY "questions_update_policy"
ON questions FOR UPDATE TO authenticated
USING (scope = 'user' AND owner_user_id = auth.uid());

CREATE POLICY "questions_delete_policy"
ON questions FOR DELETE TO authenticated
USING (scope = 'user' AND owner_user_id = auth.uid());
```

## Frontend Query Pattern

All question queries must explicitly filter out trial questions:

```typescript
const { data } = await supabase
  .from('questions')
  .select('id, text, chapter, scope')
  .in('scope', ['global', 'user'])  // Excludes 'trial'
  .order('id', { ascending: true })
```

## Question Count Display

The main page displays question progress with clear separation:

```
COMPLETION STATUS
30 / 100              ← Core questions progress
(+5/8 自定义)         ← Custom questions (if any)
```

Progress bar reflects core question completion only.

## Creating Custom Questions

When saving a custom question, must set:

```typescript
await supabase.from('questions').insert({
  id: crypto.randomUUID(),
  text: questionText,
  chapter: chapterName,
  scope: 'user',           // Required for RLS
  owner_user_id: userId,   // Required for RLS
  created_by: 'user',
})
```

## Files Modified

### Database Migration
- `supabase/migrations/20260122000000_question_scope_isolation.sql`

### Frontend Files Updated
- `app/main/page.tsx` - Main question list, count display, save function
- `app/today/page.tsx` - Daily question selection
- `app/progress/page.tsx` - Progress tracking
- `app/progress/book/page.tsx` - Book progress view
- `app/photos/page.tsx` - Photo question linking
- `app/photos/new/page.tsx` - New photo question selection
- `lib/questionsApi.ts` - Shared question fetching API

## Draft Page Behavior

The draft page (`/draft`) uses the trial question directly by ID:
- Question ID: `draft_demo`
- Scope: `trial`
- This question is never shown in main question lists
- It does not count toward the 100 core questions

## Migration Notes

1. Apply migration: `supabase db push`
2. Verify draft_demo scope: `SELECT id, scope FROM questions WHERE id = 'draft_demo'`
3. Should show `scope = 'trial'`

## Verification Checklist

- [ ] Draft page works with trial question
- [ ] Main page shows only 100 core questions (no draft_demo)
- [ ] Custom questions appear only for their creator
- [ ] Question count shows "X / 100" for core, "(+Y/Z custom)" separately
- [ ] Feature unlock thresholds use core question count only
