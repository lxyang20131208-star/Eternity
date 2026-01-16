import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Weekly reminder email template
function getReminderEmailHtml(userName: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Weekly Story Reminder</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a1628; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <tr>
      <td>
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #00d4ff; font-size: 28px; margin: 0;">Digital Life</h1>
          <p style="color: #8899aa; font-size: 14px; margin-top: 8px;">Your Personal Biography</p>
        </div>

        <!-- Main Content -->
        <div style="background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(124, 58, 237, 0.1)); border: 1px solid rgba(0, 212, 255, 0.2); border-radius: 12px; padding: 32px;">
          <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 16px;">Hey ${userName || 'there'}!</h2>

          <p style="color: #c8d4e0; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
            It's time to record another chapter of your story. Every memory you capture becomes a treasure for generations to come.
          </p>

          <p style="color: #c8d4e0; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
            Take just 5 minutes today to answer a question about your life. Your future self (and family) will thank you.
          </p>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}"
               style="display: inline-block; background: linear-gradient(135deg, #00d4ff, #0099ff); color: #051019; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Continue Your Story
            </a>
          </div>

          <!-- Progress Hint -->
          <div style="background: rgba(0, 0, 0, 0.2); border-radius: 8px; padding: 16px; margin-top: 24px;">
            <p style="color: #8899aa; font-size: 14px; margin: 0; text-align: center;">
              Consistency is key. Small recordings add up to an amazing biography.
            </p>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px;">
          <p style="color: #667788; font-size: 12px; margin: 0;">
            You're receiving this because you enabled weekly reminders.
          </p>
          <p style="color: #667788; font-size: 12px; margin: 8px 0 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/today" style="color: #00d4ff; text-decoration: none;">Manage preferences</a>
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

export async function POST(req: NextRequest) {
  // Verify internal API key for cron jobs
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Get today's day of week (mon, tue, wed, thu, fri, sat, sun)
    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
    const today = days[new Date().getDay()]

    // Fetch users who should receive reminder today
    const { data: reminders, error: fetchError } = await supabase
      .from('weekly_reminders')
      .select('email, user_id')
      .eq('weekday', today)
      .eq('status', 'active')
      .eq('channel', 'email')

    if (fetchError) {
      throw fetchError
    }

    if (!reminders || reminders.length === 0) {
      return NextResponse.json({ message: 'No reminders to send today', sent: 0 })
    }

    // Send emails
    const results = await Promise.allSettled(
      reminders.map(async (reminder) => {
        // Get user name from auth
        const { data: userData } = await supabase.auth.admin.getUserById(reminder.user_id)
        const userName = userData?.user?.user_metadata?.full_name ||
                         userData?.user?.email?.split('@')[0] ||
                         'there'

        const { error } = await resend.emails.send({
          from: 'Digital Life <reminders@yourdomain.com>',
          to: reminder.email,
          subject: 'Time to record your story',
          html: getReminderEmailHtml(userName),
        })

        if (error) throw error
        return reminder.email
      })
    )

    const sent = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    return NextResponse.json({
      message: `Sent ${sent} reminders, ${failed} failed`,
      sent,
      failed,
    })
  } catch (error: any) {
    console.error('Email send error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send reminders' },
      { status: 500 }
    )
  }
}
