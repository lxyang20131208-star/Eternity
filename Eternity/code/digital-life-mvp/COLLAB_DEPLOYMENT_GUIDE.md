# Collaboration Feature - Deployment Guide

## Overview

The Collaboration feature allows project owners to invite family and friends to contribute memories to specific questions via voice recordings. This is a completely additive feature that does not modify existing functionality.

## Architecture

### New Database Tables
- `collab_invites` - Stores invitation links
- `collab_invite_questions` - Links questions to invites
- `collab_comments` - Stores contributed memories (audio + text)

### New Storage Bucket
- `collab-audio` - Stores voice recordings from contributors

### New Pages
- `/collab` - Owner dashboard (create invites, review contributions)
- `/collab/invite?token=xxx` - Invitee contribution page

## Deployment Steps

### 1. Run Database Migration

```bash
# Link to your Supabase project (if not already linked)
supabase link --project-ref YOUR_PROJECT_REF

# Run the migration
supabase db push

# Or manually run the migration file
psql YOUR_DATABASE_URL -f supabase/migrations/20260125_collab_feature.sql
```

### 2. Verify Database Setup

Check that the following tables were created:
- `collab_invites`
- `collab_invite_questions`
- `collab_comments`

Check that the storage bucket was created:
- `collab-audio`

### 3. Verify RLS Policies

Run this query to check RLS is enabled:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'collab%';
```

All should return `rowsecurity = true`.

### 4. Test the Feature

1. **As Owner:**
   - Navigate to `/collab`
   - Click "Create Invite Link"
   - Select 1-2 questions
   - Optionally add a message
   - Generate the link
   - Copy the invite link

2. **As Invitee:**
   - Open the invite link in a new browser/incognito window
   - Enter your name
   - Click "Record Your Memory" for a question
   - Allow microphone access
   - Record a short message (5-10 seconds)
   - Stop and submit

3. **Back as Owner:**
   - Refresh `/collab` page
   - Check "Recent Contributions" section
   - You should see the new contribution
   - Click "Play Audio" to hear it
   - Change status to "Reviewed"

## Feature Requirements

### Unlocking
- The COLLAB button in the navigation requires **90 answered questions** to unlock
- This is defined in `UNLOCK_THRESHOLDS.collab` in both `UnifiedNav.tsx` and `main/page.tsx`

### Browser Requirements for Invitees
- Microphone access required for recording
- Modern browser with MediaRecorder API support
- HTTPS required for microphone permissions (development: localhost is OK)

## Security Notes

### RLS (Row Level Security)
All tables have RLS enabled with the following policies:

**collab_invites:**
- Owners can manage their own invites
- Anyone can read invites by token (for invite validation)

**collab_invite_questions:**
- Owners can manage questions linked to their invites
- Anyone can read (needed for invitees to see shared questions)

**collab_comments:**
- Owners can read/update/delete all comments in their project
- Anyone can insert comments (for invitee contributions)
- Contributors can read their own comments

**Storage (collab-audio):**
- Owners can read all audio in their project
- Contributors can read their own audio
- Anyone can upload (for invitee recordings)
- Only owners can delete

### Privacy Considerations
- Invitees do NOT need to create an account
- Invitees can only see questions shared with them
- Invitees cannot see other contributors' submissions
- Owner answers are only visible if `can_view_owner_answer` is enabled

## API Reference

### collabApi.ts Functions

```typescript
// Create a new invite
createInvite({
  projectId: string,
  userId: string,
  questionIds: string[],
  role?: 'contributor' | 'viewer',
  canViewOwnerAnswer?: boolean,
  ownerMessage?: string,
  expiresAt?: Date
})

// Fetch invite by token
fetchInviteByToken(token: string)

// Fetch questions for an invite
fetchInviteQuestions(inviteId: string)

// Create a contribution
createCollabComment({
  inviteId: string,
  questionId: string,
  projectId: string,
  contributorName?: string,
  audioStoragePath?: string,
  commentText?: string
})

// Upload audio
uploadCollabAudio(
  projectId: string,
  inviteId: string,
  commentId: string,
  audioBlob: Blob
)

// Get dashboard data
fetchOwnerCollabDashboard(projectId: string)

// Update comment status
updateCommentStatus(
  commentId: string,
  status: 'new' | 'reviewed' | 'pinned' | 'resolved'
)
```

## Troubleshooting

### Issue: Invite link shows "Invalid Invite"
- Check that the migration ran successfully
- Verify `collab_invites` table exists
- Check browser console for errors

### Issue: Cannot record audio
- Ensure HTTPS or localhost
- Check microphone permissions in browser
- Verify MediaRecorder API support

### Issue: Audio upload fails
- Check `collab-audio` bucket exists
- Verify storage policies are set correctly
- Check browser console for CORS errors

### Issue: Owner cannot see contributions
- Verify RLS policies for `collab_comments`
- Check that projectId matches
- Refresh the page

### Issue: "Could not find table" error
- RLS policies reference tables that might not exist yet
- Re-run the migration
- Check `supabase/migrations/` folder

## Future Enhancements

Possible additions (not in v1):
- Email notifications when new contributions arrive
- Ability to transcribe audio automatically
- Merge contributions into main answers
- Analytics dashboard (who contributed, completion rate)
- Expire links after X days
- Limit contributions per invite

## Support

For issues or questions:
1. Check browser console for errors
2. Check Supabase logs for backend errors
3. Verify all migration steps completed
4. Test with a simple 1-question invite first
