# Biography Outline Feature - Deployment Guide

## Overview
This feature consolidates answer transcripts into a structured biography outline using AI generation.

## Prerequisites
- Supabase CLI installed and logged in
- GEMINI_API_KEY configured in Supabase Edge Function secrets
- Database access for running migrations

## Deployment Steps

### 1. Run Database Migration
```bash
# Connect to your Supabase project
supabase db push

# Or apply the migration file directly via Supabase Dashboard:
# Go to SQL Editor and run: supabase/migrations/20241224_biography_outlines.sql
```

### 2. Configure Edge Function Secrets
```bash
# Set the Gemini API key (required)
supabase secrets set GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Set the model (defaults to gemini-2.0-flash-exp)
supabase secrets set GEMINI_MODEL=gemini-2.0-flash-exp
```

### 3. Deploy Edge Function
```bash
# Deploy the generate_biography_outline function
supabase functions deploy generate_biography_outline
```

### 4. Verify Deployment
```bash
# Check function logs
supabase functions logs generate_biography_outline

# Test with a sample request (replace with actual project_id and auth token)
curl -X POST https://your-project.supabase.co/functions/v1/generate_biography_outline \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "your-project-uuid",
    "style_prefs": {
      "tone": "narrative",
      "depth": "detailed",
      "languageRule": "convert-Chinese-to-Simplified"
    }
  }'
```

## Testing Checklist

### Database
- [ ] Tables `biography_outlines` and `outline_jobs` created
- [ ] RLS policies active and scoped to project owners
- [ ] Foreign key constraints working
- [ ] Indexes created for performance

### Edge Function
- [ ] Function deployed successfully
- [ ] GEMINI_API_KEY secret configured
- [ ] Function can read from `answer_sessions`
- [ ] Function can write to `biography_outlines` and `outline_jobs`
- [ ] Error handling and retries working
- [ ] Chunking logic handles large datasets

### Frontend
- [ ] CTA appears when `answeredSet.size >= 100`
- [ ] Style preferences modal opens and saves selections
- [ ] Outline generation starts and shows progress
- [ ] Progress polling updates every 3 seconds
- [ ] Completed outline displays in modal
- [ ] Copy to Markdown works
- [ ] Outline history shows previous versions
- [ ] Version selection and viewing works

### Security
- [ ] RLS prevents unauthorized access to outlines
- [ ] Users can only generate outlines for their own projects
- [ ] Auth tokens validated in Edge Function
- [ ] Storage permissions properly scoped

## API Endpoints

### Generate Outline
**POST** `/functions/v1/generate_biography_outline`
```json
{
  "project_id": "uuid",
  "style_prefs": {
    "tone": "professional" | "casual" | "narrative",
    "depth": "brief" | "detailed" | "comprehensive",
    "languageRule": "keep-English" | "convert-Chinese-to-Simplified"
  }
}
```

Response:
```json
{
  "success": true,
  "job_id": "uuid",
  "outline_id": "uuid",
  "version": 1,
  "outline": { ... }
}
```

### Poll Job Status
**Query** `outline_jobs` table via Supabase client:
```typescript
const { data } = await supabase
  .from('outline_jobs')
  .select('*')
  .eq('id', jobId)
  .single()
```

### Get Outline
**Query** `biography_outlines` table:
```typescript
const { data } = await supabase
  .from('biography_outlines')
  .select('*')
  .eq('id', outlineId)
  .single()
```

## Monitoring

### Edge Function Logs
```bash
# Real-time logs
supabase functions logs generate_biography_outline --tail

# Recent logs
supabase functions logs generate_biography_outline
```

### Database Queries
```sql
-- Check outline generation stats
SELECT 
  status, 
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
FROM outline_jobs
GROUP BY status;

-- Find failed jobs
SELECT * FROM outline_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 10;

-- Check outline versions per project
SELECT 
  project_id,
  COUNT(*) as total_outlines,
  MAX(version) as latest_version
FROM biography_outlines
WHERE status = 'done'
GROUP BY project_id;
```

## Troubleshooting

### "Not enough transcripts" error
- Verify at least 10 answer_sessions have non-null transcript_text
- Check transcribe_session function is working properly

### "Gemini API error"
- Verify GEMINI_API_KEY is set correctly
- Check API quota and rate limits
- Review function logs for detailed error messages

### "Unauthorized" error
- Ensure user is logged in and has valid session
- Verify RLS policies on projects table
- Check project ownership

### Slow generation
- Large datasets (500+ sessions) may take 2-5 minutes
- Monitor progress_percent in outline_jobs table
- Check Gemini API response times in logs

### Progress stuck
- Check Edge Function logs for errors
- Verify outline_jobs.status and error_text
- May need to restart job manually

## Performance Optimization

### Recommended Settings
- Max chunk size: 50 sessions per batch
- Poll interval: 3 seconds
- Gemini temperature: 0.4 (for consistency)
- Max output tokens: 8192

### Scaling Considerations
- For 1000+ sessions: Consider increasing chunk processing parallelism
- Add pagination for outline history if versions exceed 50
- Implement background cleanup for old failed jobs

## Future Enhancements
- [ ] PDF/DOCX export with document generation
- [ ] Collaborative editing of outline sections
- [ ] Export to storage bucket with signed URLs
- [ ] Email notification when outline is ready
- [ ] Compare two outline versions side-by-side
- [ ] Auto-trigger on reaching 100 completed answers
- [ ] Chapter-specific outline generation
- [ ] Multi-language output support

## Support
For issues or questions, check:
1. Edge Function logs: `supabase functions logs`
2. Database error logs in Supabase Dashboard
3. Browser console for client-side errors
4. Network tab for API request/response inspection
