# 📖 Biography Outline Feature - Quick Reference

## 🚀 Quick Deploy (3 Steps)

```powershell
# 1. Apply database migration
supabase db push

# 2. Set Gemini API key
supabase secrets set GEMINI_API_KEY=your_key_here

# 3. Deploy function
supabase functions deploy generate_biography_outline
```

## 📂 File Structure

```
digital-life-mvp/
├── supabase/
│   ├── migrations/
│   │   └── 20241224_biography_outlines.sql      ← Database schema
│   └── functions/
│       └── generate_biography_outline/
│           ├── index.ts                         ← Edge Function
│           └── config.toml                      ← Function config
├── lib/
│   └── biographyOutlineApi.ts                   ← API utilities
├── app/
│   └── page.tsx                                 ← UI components
├── BIOGRAPHY_OUTLINE_SUMMARY.md                 ← Full documentation
├── BIOGRAPHY_OUTLINE_DEPLOYMENT.md              ← Deployment guide
└── deploy-biography-outline.ps1                 ← Deploy script
```

## 🎯 Key Features

| Feature | Status | Description |
|---------|--------|-------------|
| Auto CTA | ✅ | Shows at 100+ completed questions |
| Style Prefs | ✅ | Tone, depth, language customization |
| Progress | ✅ | Real-time percentage updates |
| Versioning | ✅ | Auto-incremented version numbers |
| History | ✅ | View all previous outlines |
| Export | ✅ | Copy to Markdown clipboard |
| RLS Security | ✅ | Project owner scoped access |
| Error Handling | ✅ | Retry logic + friendly messages |

## 📊 Database Tables

### `biography_outlines`
```sql
-- Stores generated outlines
id, project_id, status, outline_json, version, 
style_prefs_json, export_object_key, error_text, 
created_at, updated_at
```

### `outline_jobs`
```sql
-- Tracks generation jobs
id, project_id, status, params_json, result_outline_id,
progress_percent, error_text, created_at, updated_at
```

## 🔧 API Functions

```typescript
// Generate new outline
generateBiographyOutline(projectId, stylePrefs)

// Poll job status
getOutlineJobStatus(jobId)

// Get outline by ID
getOutlineById(outlineId)

// List project outlines
listProjectOutlines(projectId)

// Get latest outline
getLatestOutline(projectId)

// Convert to Markdown
outlineToMarkdown(outlineJSON)

// Copy to clipboard
copyToClipboard(text)
```

## 🎨 UI Components

| Component | Trigger | Purpose |
|-----------|---------|---------|
| CTA Card | answeredSet >= 100 | Launch outline generation |
| Style Modal | Click "Generate" | Customize preferences |
| Progress Bar | Job processing | Show completion % |
| Outline Viewer | Job complete | Display sections & quotes |
| History Modal | Click "View Previous" | Browse versions |
| Toast | Actions | Success/error feedback |

## ⚡ Performance

| Dataset Size | Expected Time |
|--------------|---------------|
| 10-50 sessions | 30-60 seconds |
| 100-200 sessions | 1-2 minutes |
| 500+ sessions | 3-5 minutes |

## 🔐 Security

- ✅ RLS policies on both tables
- ✅ Auth token validation in Edge Function
- ✅ Project ownership verification
- ✅ No cross-user data access

## 🧪 Test Checklist

```bash
# 1. Verify deployment
supabase functions logs generate_biography_outline --tail

# 2. Check tables exist
# Query in Supabase Dashboard:
SELECT * FROM biography_outlines LIMIT 1;
SELECT * FROM outline_jobs LIMIT 1;

# 3. Test RLS
# Try accessing another user's outline (should fail)

# 4. End-to-end test
# Complete 100 questions → Generate outline → View result
```

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not enough transcripts" | Need 10+ sessions with transcript_text |
| "Unauthorized" | Check user login & project ownership |
| Generation stuck | Check `outline_jobs.status` & `error_text` |
| Slow generation | Normal for large datasets, monitor progress |

## 📞 Useful Commands

```bash
# View logs
supabase functions logs generate_biography_outline --tail

# Check job status (SQL)
SELECT status, COUNT(*) FROM outline_jobs GROUP BY status;

# Find failures (SQL)
SELECT * FROM outline_jobs WHERE status='failed' ORDER BY created_at DESC;

# Check secrets
supabase secrets list
```

## 🔗 Quick Links

- **Full Summary**: [BIOGRAPHY_OUTLINE_SUMMARY.md](./BIOGRAPHY_OUTLINE_SUMMARY.md)
- **Deployment Guide**: [BIOGRAPHY_OUTLINE_DEPLOYMENT.md](./BIOGRAPHY_OUTLINE_DEPLOYMENT.md)
- **Deploy Script**: [deploy-biography-outline.ps1](./deploy-biography-outline.ps1)
- **Migration**: [supabase/migrations/20241224_biography_outlines.sql](./supabase/migrations/20241224_biography_outlines.sql)
- **Edge Function**: [supabase/functions/generate_biography_outline/index.ts](./supabase/functions/generate_biography_outline/index.ts)
- **API Utils**: [lib/biographyOutlineApi.ts](./lib/biographyOutlineApi.ts)

---

**Status**: ✅ Feature Complete & Ready for Production

**Last Updated**: 2024-12-24
