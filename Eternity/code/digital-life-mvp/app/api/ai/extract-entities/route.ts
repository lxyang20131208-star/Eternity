import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 400 })
    }
    const openai = new OpenAI({ apiKey: openaiApiKey })
    const { text, projectId } = await request.json();

    if (!text || !projectId) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 调用 OpenAI 进行实体抽取
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `你是一个专业的传记分析助手。你的任务是从用户提供的文本中抽取以下结构化信息：

1. **人物（People）**：识别文本中提到的所有人物
   - name: 人物姓名
   - aliases: 别称/昵称数组（如：爸爸、父亲、老刘）
   - role: 与主人公的关系（父亲、母亲、朋友、老师等）
   - frequency: 在文本中被提及的次数
   - confidence: 抽取置信度（0-1）
   - evidence: 原文证据片段数组

2. **地点（Places）**：识别文本中提到的所有地点
   - name: 地点名称
   - placeLevel: 层级（country/city/district/point）
   - parentPlace: 上级地点（如"牡丹江第一小学"的parent是"牡丹江"）
   - frequency: 被提及次数
   - confidence: 置信度
   - evidence: 原文证据

3. **时间（Times）**：识别文本中的时间表达
   - type: 类型（exact/range/fuzzy）
   - text: 原始表达（如"那年冬天"、"小学三年级"、"2012年夏天"）
   - startDate: 开始日期（ISO格式，可推断）
   - endDate: 结束日期（可选）
   - confidence: 置信度
   - evidence: 原文证据

4. **事件（Events）**：识别文本中的重要事件
   - title: 事件标题（简短）
   - summary: 事件摘要
   - people: 涉及的人物名称数组
   - places: 涉及的地点名称数组
   - time: 时间信息（可选）
   - tags: 标签数组（童年、搬家、父亲、学校等）
   - confidence: 置信度
   - evidence: 原文证据

**输出格式**：严格按照 JSON 格式输出，结构如下：
{
  "people": [...],
  "places": [...],
  "times": [...],
  "events": [...]
}

注意事项：
- 人物识别要合并同一个人的不同称呼（如"父亲"="爸爸"="老爸"）
- 地点要识别层级关系（国家→城市→区县→具体地点）
- 时间要尽可能推断具体日期（如"小学三年级"可能对应某个年份范围）
- 事件要提取"who+when+where+what"的完整信息
- confidence 基于文本明确性：明确提及=0.9-1.0，暗示/推断=0.5-0.8，猜测=0.3-0.4
`,
        },
        {
          role: 'user',
          content: `请分析以下文本，抽取结构化信息：\n\n${text}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const result = completion.choices[0]?.message?.content;
    if (!result) {
      return NextResponse.json({ error: 'AI 返回结果为空' }, { status: 500 });
    }

    const extracted = JSON.parse(result);

    return NextResponse.json({
      success: true,
      data: extracted,
      usage: completion.usage,
    });
  } catch (error) {
    console.error('AI 抽取失败:', error);
    return NextResponse.json(
      { error: '抽取失败', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
