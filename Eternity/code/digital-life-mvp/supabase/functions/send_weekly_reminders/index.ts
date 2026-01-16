// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Weekly question email template - includes the actual question
function getWeeklyQuestionEmailHtml(
  userName: string,
  question: string,
  questionId: string,
  appUrl: string,
  answeredCount: number,
  totalQuestions: number
) {
  const progressPercent = Math.round((answeredCount / totalQuestions) * 100)

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
          <p style="color: #8899aa; font-size: 14px; margin-top: 8px;">Your Weekly Story Question</p>
        </div>

        <div style="background: linear-gradient(135deg, rgba(0, 212, 255, 0.1), rgba(124, 58, 237, 0.1)); border: 1px solid rgba(0, 212, 255, 0.2); border-radius: 12px; padding: 32px;">
          <p style="color: #8899aa; font-size: 14px; margin: 0 0 8px;">Hey ${userName}, here's this week's question:</p>

          <!-- The Question -->
          <div style="background: rgba(0, 0, 0, 0.3); border-left: 4px solid #00d4ff; padding: 20px; margin: 16px 0; border-radius: 0 8px 8px 0;">
            <p style="color: #ffffff; font-size: 20px; font-weight: 600; line-height: 1.5; margin: 0;">
              "${question}"
            </p>
          </div>

          <p style="color: #c8d4e0; font-size: 15px; line-height: 1.6; margin: 16px 0 24px;">
            Take a few minutes to reflect on this question. Your answer will become part of your personal biography - a gift for future generations.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}?questionId=${questionId}"
               style="display: inline-block; background: linear-gradient(135deg, #00d4ff, #0099ff); color: #051019; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
              Answer This Question
            </a>
          </div>

          <!-- Progress Bar -->
          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(255,255,255,0.1);">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
              <span style="color: #8899aa; font-size: 13px;">Your Progress</span>
              <span style="color: #00d4ff; font-size: 13px; font-weight: 600;">${answeredCount} of ${totalQuestions} questions</span>
            </div>
            <div style="background: rgba(255,255,255,0.1); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #00d4ff, #7c3aed); height: 100%; width: ${progressPercent}%; border-radius: 4px;"></div>
            </div>
          </div>
        </div>

        <!-- Tips Section -->
        <div style="margin-top: 24px; padding: 20px; background: rgba(255,255,255,0.03); border-radius: 8px;">
          <p style="color: #ffd700; font-size: 14px; font-weight: 600; margin: 0 0 8px;">💡 Recording Tips</p>
          <ul style="color: #8899aa; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 20px;">
            <li>Find a quiet place where you feel comfortable</li>
            <li>There's no wrong answer - just speak from the heart</li>
            <li>Include specific details and names when possible</li>
          </ul>
        </div>

        <div style="text-align: center; margin-top: 32px;">
          <p style="color: #667788; font-size: 12px;">
            You're receiving this because you enabled weekly reminders.<br/>
            <a href="${appUrl}/today" style="color: #00d4ff; text-decoration: none;">Manage preferences</a>
          </p>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const resendApiKey = Deno.env.get("RESEND_API_KEY")
    const appUrl = Deno.env.get("APP_URL") || "https://yourapp.com"

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get today's day of week
    const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
    const today = days[new Date().getDay()]

    // Fetch users who should receive reminder today
    const { data: reminders, error: fetchError } = await supabase
      .from("weekly_reminders")
      .select("email, user_id, project_id")
      .eq("weekday", today)
      .eq("status", "active")
      .eq("channel", "email")

    if (fetchError) {
      throw fetchError
    }

    if (!reminders || reminders.length === 0) {
      return new Response(
        JSON.stringify({ message: "No reminders to send today", sent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // Get all questions for reference
    const { data: allQuestions } = await supabase
      .from("questions")
      .select("id, text")
      .order("id")

    const totalQuestions = allQuestions?.length || 0

    let sent = 0
    let failed = 0

    // Send emails via Resend
    for (const reminder of reminders) {
      try {
        // Get user info
        const { data: userData } = await supabase.auth.admin.getUserById(reminder.user_id)
        const userName = userData?.user?.user_metadata?.full_name ||
                         userData?.user?.email?.split("@")[0] ||
                         "there"

        // Get user's answered questions
        const { data: answeredSessions } = await supabase
          .from("answer_sessions")
          .select("question_id")
          .eq("project_id", reminder.project_id)

        const answeredIds = new Set((answeredSessions || []).map(s => String(s.question_id)))
        const answeredCount = answeredIds.size

        // Find next unanswered question
        const unansweredQuestions = (allQuestions || []).filter(
          q => !answeredIds.has(String(q.id))
        )

        if (unansweredQuestions.length === 0) {
          // User has answered all questions - send completion email
          continue
        }

        // Pick a random unanswered question for variety
        const randomIndex = Math.floor(Math.random() * Math.min(5, unansweredQuestions.length))
        const nextQuestion = unansweredQuestions[randomIndex]

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Digital Life <reminders@yourdomain.com>",
            to: reminder.email,
            subject: `📝 Your weekly question: "${nextQuestion.text.slice(0, 50)}..."`,
            html: getWeeklyQuestionEmailHtml(
              userName,
              nextQuestion.text,
              String(nextQuestion.id),
              appUrl,
              answeredCount,
              totalQuestions
            ),
          }),
        })

        if (res.ok) {
          sent++
        } else {
          const errText = await res.text()
          console.error(`Failed to send to ${reminder.email}:`, errText)
          failed++
        }
      } catch (e) {
        console.error(`Error sending to ${reminder.email}:`, e)
        failed++
      }
    }

    return new Response(
      JSON.stringify({ message: `Sent ${sent} question emails, ${failed} failed`, sent, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (e: any) {
    console.error("Error:", e)
    return new Response(
      JSON.stringify({ error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
