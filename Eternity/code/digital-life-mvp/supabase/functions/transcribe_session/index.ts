// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

type ReqBody = { session_id: string }

function abToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab)
  let bin = ""
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function extractGeminiText(respJson: any): string {
  const c0 = respJson?.candidates?.[0]
  const parts = c0?.content?.parts ?? []
  const texts = parts
    .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
    .filter(Boolean)
  return texts.join("\n").trim()
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function callGeminiTranscribe(params: {
  apiKey: string
  model: string
  mimeType: string
  audioBase64: string
  languageHint?: string
}): Promise<string> {
  const { apiKey, model, mimeType, audioBase64, languageHint } = params

  console.log(`[callGeminiTranscribe] Starting transcription, model: ${model}, audioBase64 length: ${audioBase64.length}`)

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

  const prompt =
    `Please transcribe the following audio into plain text.\n` +
    `Rules:\n` +
    `- Output ONLY the transcript text.\n` +
    `- Do NOT add titles, bullet points, or explanations.\n` +
    `- Keep the original language of the speech (e.g., English stays English).\n` +
    `- For Chinese content: Always use Simplified Chinese (简体中文). Convert Traditional Chinese to Simplified Chinese.\n` +
    `- IMPORTANT: Transcribe the ENTIRE audio from beginning to end. Do not skip any parts or truncate early.\n` +
    (languageHint ? `- Language hint: ${languageHint}\n` : "")

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: mimeType,
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generation_config: { temperature: 0 },
  }

  let lastErr = ""
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[callGeminiTranscribe] Attempt ${attempt}/3`)

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    if (resp.ok) {
      const json = await resp.json()
      const text = extractGeminiText(json)
      console.log(`[callGeminiTranscribe] Success! Transcript length: ${text?.length || 0}`)
      if (!text) throw new Error("Gemini returned empty transcript")
      return text
    }

    lastErr = await resp.text()
    console.error(`[callGeminiTranscribe] Attempt ${attempt} failed:`, resp.status, lastErr)
    if (resp.status === 429 || resp.status === 503) {
      await sleep(500 * attempt)
      continue
    }
    break
  }

  console.error(`[callGeminiTranscribe] All attempts failed`)
  throw new Error(`Gemini transcription failed: ${lastErr}`)
}

Deno.serve(async (req) => {
  // OPTIONS 预检
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders })
  }

  const okJson = (data: any, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })

  const errText = (msg: string, status = 400) => new Response(msg, { status, headers: corsHeaders })

  let sessionIdForFailUpdate: string | null = null

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? ""

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return errText("Missing Supabase env vars", 500)
    }
    if (!GEMINI_API_KEY) {
      return errText("Missing GEMINI_API_KEY secret", 500)
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

    sessionIdForFailUpdate = body.session_id

    const { data: sess, error: sErr } = await admin
      .from("answer_sessions")
      .select(
        "id, project_id, user_id, question_id, audio_object_key, recorded_at, transcript_version, status, audio_mime",
      )
      .eq("id", body.session_id)
      .maybeSingle()

    if (sErr) throw sErr
    if (!sess) return errText("Session not found", 404)

    if (sess.user_id && sess.user_id !== authedUserId) {
      return errText("Forbidden", 403)
    }

    await admin.from("answer_sessions").update({ status: "transcribing", error_text: null }).eq("id", sess.id)

    const { data: signed, error: signErr } = await admin.storage.from("vault").createSignedUrl(sess.audio_object_key, 600)
    if (signErr) throw signErr

    const audioResp = await fetch(signed.signedUrl)
    if (!audioResp.ok) throw new Error("Failed to fetch audio via signed URL")
    const audioBlob = await audioResp.blob()

    console.log(`[transcribe_session] Audio blob size: ${audioBlob.size} bytes, type: ${audioBlob.type}`)

    const mimeType = (sess.audio_mime as string) || audioBlob.type || "audio/webm"
    const audioArrayBuffer = await audioBlob.arrayBuffer()
    const audioBase64 = abToBase64(audioArrayBuffer)

    console.log(`[transcribe_session] Audio base64 size: ${audioBase64.length} chars`)

    const transcript = await callGeminiTranscribe({
      apiKey: GEMINI_API_KEY,
      model: "gemini-2.5-flash",
      mimeType,
      audioBase64,
      languageHint: "Chinese (zh-CN)",
    })

    const recordedAt = new Date(sess.recorded_at ?? Date.now())
    const yyyy = recordedAt.getUTCFullYear()
    const mm = String(recordedAt.getUTCMonth() + 1).padStart(2, "0")
    const v = Number(sess.transcript_version ?? 1)
    const transcriptPath = `projects/${sess.project_id}/transcripts/${yyyy}/${mm}/${sess.id}_v${v}.txt`

    const { error: upT } = await admin.storage
      .from("vault")
      .upload(transcriptPath, new Blob([transcript], { type: "text/plain; charset=utf-8" }), {
        contentType: "text/plain; charset=utf-8",
        upsert: false,
      })
    if (upT) throw upT

    const qaPath = `projects/${sess.project_id}/qa_log/qa_log.jsonl`
    let oldText = ""
    const dl = await admin.storage.from("vault").download(qaPath)
    if (dl.data) oldText = await dl.data.text()

    const line = JSON.stringify({
      session_id: sess.id,
      project_id: sess.project_id,
      question_id: sess.question_id,
      recorded_at: sess.recorded_at,
      audio_object_key: sess.audio_object_key,
      transcript_object_key: transcriptPath,
      transcript,
      transcript_version: v,
      provider: "gemini",
      model: "gemini-2.5-flash",
    })

    const newText = (oldText ? oldText.replace(/\s*$/, "") + "\n" : "") + line + "\n"
    const { error: upLog } = await admin.storage
      .from("vault")
      .upload(qaPath, new Blob([newText], { type: "application/json; charset=utf-8" }), {
        contentType: "application/json; charset=utf-8",
        upsert: true,
      })
    if (upLog) throw upLog

    const { error: uErr } = await admin
      .from("answer_sessions")
      .update({
        status: "ready",
        transcript_object_key: transcriptPath,
        transcript_text: transcript,
        transcript_version: v,
      })
      .eq("id", sess.id)
    if (uErr) throw uErr

    return okJson({ ok: true, transcript_object_key: transcriptPath })
  } catch (e) {
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      if (sessionIdForFailUpdate && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        await admin
          .from("answer_sessions")
          .update({ status: "failed", error_text: String((e as any)?.message ?? e) })
          .eq("id", sessionIdForFailUpdate)
      }
    } catch (_) {}

    return errText(String((e as any)?.message ?? e), 500)
  }
})
