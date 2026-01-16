import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RESEND_API_KEY = process.env.RESEND_API_KEY

export async function POST(req: NextRequest) {
  try {
    const { userId, projectId, type, title, body, data, sendEmail = true } = await req.json()

    if (!userId || !type || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Create the notification in database
    const { data: notification, error: notifError } = await supabase
      .rpc('create_collaboration_notification', {
        p_user_id: userId,
        p_project_id: projectId || null,
        p_type: type,
        p_title: title,
        p_body: body || '',
        p_data: data || {},
      })

    if (notifError) throw notifError

    // Check if user wants email notifications
    if (sendEmail && RESEND_API_KEY) {
      const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()

      // Default to sending emails if no preferences set
      const shouldSendEmail = !prefs || (
        (type === 'comment' && prefs.email_comments !== false) ||
        (type === 'answer' && prefs.email_answers !== false) ||
        (type === 'milestone' && prefs.email_milestones !== false) ||
        type === 'invite'
      )

      if (shouldSendEmail) {
        // Get user email
        const { data: userData } = await supabase.auth.admin.getUserById(userId)
        const email = userData?.user?.email

        if (email) {
          // Send email notification
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${RESEND_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Digital Life <notifications@yourdomain.com>',
              to: email,
              subject: `${getNotificationEmoji(type)} ${title}`,
              html: getNotificationEmailHtml(type, title, body || '', data),
            }),
          })

          // Mark as sent
          await supabase
            .from('notifications')
            .update({ is_sent_email: true })
            .eq('id', notification)
        }
      }
    }

    return NextResponse.json({ success: true, notificationId: notification })
  } catch (error: any) {
    console.error('Notification error:', error)
    return NextResponse.json({ error: error.message || 'Failed to send notification' }, { status: 500 })
  }
}

function getNotificationEmoji(type: string): string {
  switch (type) {
    case 'comment': return '💬'
    case 'answer': return '🎤'
    case 'mention': return '@'
    case 'invite': return '🤝'
    case 'milestone': return '🎉'
    default: return '🔔'
  }
}

function getNotificationEmailHtml(type: string, title: string, body: string, data: any): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://yourapp.com'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #0a1628; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #00d4ff; font-size: 28px; margin: 0;">Digital Life</h1>
          <p style="color: #8899aa; font-size: 14px; margin-top: 8px;">Collaboration Update</p>
        </div>

        <div style="background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(124, 58, 237, 0.1)); border: 1px solid rgba(0, 212, 255, 0.2); border-radius: 12px; padding: 32px;">
          <div style="font-size: 32px; text-align: center; margin-bottom: 16px;">
            ${getNotificationEmoji(type)}
          </div>
          <h2 style="color: #ffffff; font-size: 20px; margin: 0 0 16px; text-align: center;">
            ${title}
          </h2>
          ${body ? `
          <p style="color: #c8d4e0; font-size: 15px; line-height: 1.6; margin: 0 0 24px; text-align: center;">
            ${body}
          </p>
          ` : ''}

          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}${data?.questionId ? `?questionId=${data.questionId}` : ''}"
               style="display: inline-block; background: linear-gradient(135deg, #00d4ff, #0099ff); color: #051019; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              View in Digital Life
            </a>
          </div>
        </div>

        <div style="text-align: center; margin-top: 32px;">
          <p style="color: #667788; font-size: 12px;">
            You received this because you're a collaborator on a Digital Life project.<br/>
            <a href="${appUrl}/settings/notifications" style="color: #00d4ff; text-decoration: none;">Manage notification preferences</a>
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
`
}
