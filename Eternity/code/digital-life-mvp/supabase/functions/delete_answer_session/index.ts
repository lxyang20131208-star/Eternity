// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type ReqBody = { session_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders })
  }

  const okJson = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  const errText = (msg: string, status = 400) => new Response(msg, { status, headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return errText("Missing Supabase env vars", 500)
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return errText("Missing Authorization", 401)

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData?.user) return errText("Unauthorized", 401)
    const authedUserId = userData.user.id

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    const body = (await req.json()) as ReqBody
    if (!body?.session_id) return errText("Missing session_id", 400)

    // Load session with project ownership check
    const { data: sess, error: sErr } = await admin
      .from("answer_sessions")
      .select(
        "id, project_id, user_id, question_id, audio_object_key, transcript_object_key"
      )
      .eq("id", body.session_id)
      .maybeSingle()

    if (sErr) throw sErr
    if (!sess) return errText("Session not found", 404)

    // Verify ownership via projects.owner_id
    const { data: proj, error: pErr } = await admin
      .from("projects")
      .select("id, owner_id")
      .eq("id", sess.project_id)
      .maybeSingle()
    if (pErr) throw pErr
    if (!proj || proj.owner_id !== authedUserId) return errText("Forbidden", 403)

    // Delete storage files if they exist
    const keys: string[] = []
    if (sess.audio_object_key) keys.push(sess.audio_object_key)
    if (sess.transcript_object_key) keys.push(sess.transcript_object_key)

    for (const k of keys) {
      // Supabase Storage doesn't have delete by key in Edge Functions via admin client? It does: remove()
      const { error: rmErr } = await admin.storage.from("vault").remove([k])
      if (rmErr) {
        // Log but continue; we still delete DB row
        console.warn("Failed to remove storage object", k, rmErr)
      }
    }

    // Delete DB row
    const { error: dErr } = await admin
      .from("answer_sessions")
      .delete()
      .eq("id", sess.id)

    if (dErr) throw dErr

    return okJson({ ok: true })
  } catch (e) {
    return errText(String((e as any)?.message ?? e), 500)
  }
})
