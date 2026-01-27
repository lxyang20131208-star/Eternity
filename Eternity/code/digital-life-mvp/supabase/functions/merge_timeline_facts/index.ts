// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { GoogleGenerativeAI } from 'https://esm.sh/@google/generative-ai@0.21.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TimelineFact {
  id: string
  summary: string
  quote: string
  inferred_time_start: string | null
  time_precision: string | null
  confidence: number | null
}

interface MergeGroup {
  keepId: string
  mergeIds: string[]
  mergedSummary: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectId } = await req.json()
    if (!projectId) throw new Error('projectId is required')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')
    if (!geminiApiKey) throw new Error('GEMINI_API_KEY not configured')

    const genAI = new GoogleGenerativeAI(geminiApiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    // 获取所有时间轴事件
    const { data: facts, error } = await supabase
      .from('timeline_fact_extracts')
      .select('id, summary, quote, inferred_time_start, time_precision, confidence')
      .eq('project_id', projectId)
      .order('inferred_time_start', { ascending: true })

    if (error) throw error
    if (!facts || facts.length < 2) {
      return new Response(
        JSON.stringify({ merged: 0, message: '事件数量不足，无需合并' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 构建事件列表供AI分析
    const factsList = facts.map((f, i) => ({
      index: i,
      id: f.id,
      summary: f.summary || f.quote,
      time: f.inferred_time_start || '未知时间'
    }))

    const prompt = `你是一个时间轴事件去重专家。请分析以下人生时间轴事件列表，找出描述同一件事或非常相似的事件组。

事件列表：
${factsList.map(f => `[${f.index}] ${f.time} - ${f.summary}`).join('\n')}

请识别出可以合并的事件组。对于每组相似事件：
1. 选择一个最完整的作为保留事件
2. 将其他相似事件标记为待删除
3. 生成一个合并后的更好的摘要描述

返回JSON格式（只返回JSON，不要其他内容）：
{
  "groups": [
    {
      "keepIndex": 0,
      "mergeIndexes": [3, 7],
      "mergedSummary": "合并后的更好描述"
    }
  ]
}

如果没有发现相似事件可合并，返回：{"groups": []}

注意：
- 只合并确实描述同一事件的条目（如同一次毕业、同一次搬家等）
- 时间相近但事件不同的不要合并
- 宁可少合并，也不要错误合并不同事件`

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()

    // 解析AI返回的JSON
    let mergeResult: { groups: Array<{ keepIndex: number, mergeIndexes: number[], mergedSummary: string }> }
    try {
      // 提取JSON部分
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found in response')
      mergeResult = JSON.parse(jsonMatch[0])
    } catch (e) {
      console.error('Parse error:', e, 'Response:', responseText)
      return new Response(
        JSON.stringify({ merged: 0, message: 'AI返回格式解析失败' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!mergeResult.groups || mergeResult.groups.length === 0) {
      return new Response(
        JSON.stringify({ merged: 0, message: '没有发现可合并的相似事件' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 执行合并操作
    let mergedCount = 0
    const idsToDelete: string[] = []

    for (const group of mergeResult.groups) {
      const keepFact = factsList[group.keepIndex]
      if (!keepFact) continue

      // 更新保留的事件的摘要
      const { error: updateError } = await supabase
        .from('timeline_fact_extracts')
        .update({
          summary: group.mergedSummary,
          updated_at: new Date().toISOString()
        })
        .eq('id', keepFact.id)

      if (updateError) {
        console.error('Update error:', updateError)
        continue
      }

      // 收集要删除的ID
      for (const mergeIndex of group.mergeIndexes) {
        const mergeFact = factsList[mergeIndex]
        if (mergeFact && mergeFact.id !== keepFact.id) {
          idsToDelete.push(mergeFact.id)
        }
      }

      mergedCount++
    }

    // 批量删除合并掉的事件
    if (idsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('timeline_fact_extracts')
        .delete()
        .in('id', idsToDelete)

      if (deleteError) {
        console.error('Delete error:', deleteError)
      }
    }

    return new Response(
      JSON.stringify({
        merged: mergedCount,
        deleted: idsToDelete.length,
        message: `成功合并 ${mergedCount} 组事件，删除 ${idsToDelete.length} 条重复记录`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
