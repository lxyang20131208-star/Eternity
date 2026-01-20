import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { outlineData, personName } = await request.json();

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured. Please set GEMINI_API_KEY in environment variables.' },
        { status: 500 }
      );
    }

    // 构建提示词
    let prompt = '你是一位经验丰富的编辑和文学顾问，擅长为传记、回忆录等作品起标题。\n\n';
    prompt += '请为以下传记生成3个富有吸引力和文学性的书名建议。\n\n';

    if (personName) {
      prompt += `传记主人公：${personName}\n\n`;
    }

    if (outlineData?.sections && outlineData.sections.length > 0) {
      prompt += '传记章节概要：\n';
      outlineData.sections.slice(0, 5).forEach((section: { title?: string }, idx: number) => {
        prompt += `${idx + 1}. ${section.title || ''}\n`;
      });
      prompt += '\n';
    }

    prompt += `要求：
1. 书名要体现传记的主题和核心价值
2. 要有文学性和感染力
3. 长度适中（4-12个字）
4. 可以是抒情式、叙事式或哲理式
5. 严格按照以下JSON格式返回，不要添加任何其他内容

返回格式（JSON数组）：
[
  {"title": "岁月如歌", "description": "温情回顾一生的美好时光"},
  {"title": "时光的印记", "description": "记录生命中的重要瞬间"},
  {"title": "人生如戏", "description": "展现跌宕起伏的人生经历"}
]`;

    // 使用 Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 500,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Gemini API error:', error);
      return NextResponse.json(
        { error: `Gemini API failed: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    console.log('[generate-book-title] Gemini response:', content);

    // 尝试解析JSON
    let titles: Array<{ title: string; description: string }> = [];

    try {
      // 提取JSON部分（处理可能的markdown代码块）
      let jsonStr = content;
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      titles = JSON.parse(jsonStr);
    } catch (parseError) {
      console.warn('[generate-book-title] JSON parse failed, trying line parsing:', parseError);
      // 回退到行解析
      titles = content
        .split('\n')
        .filter((line: string) => line.trim() && !line.startsWith('要求') && !line.startsWith('返回'))
        .map((line: string) => {
          const match = line.match(/^[\d.、-]*\s*(.+?)\s*[-–—:：]\s*(.+)$/);
          if (match) {
            return {
              title: match[1].trim().replace(/["""]/g, ''),
              description: match[2].trim(),
            };
          }
          return null;
        })
        .filter((item): item is { title: string; description: string } =>
          item !== null && item.title.length >= 2 && item.title.length <= 20
        )
        .slice(0, 3);
    }

    // 确保结果有效
    titles = titles
      .filter((item) => item.title && item.title.length >= 2 && item.title.length <= 20)
      .slice(0, 3);

    if (titles.length === 0) {
      // 提供默认建议
      titles = [
        { title: '岁月留声', description: '记录生命中的珍贵回忆' },
        { title: '光阴的故事', description: '一段温暖的人生旅程' },
        { title: '往事如风', description: '追忆过往的美好时光' },
      ];
    }

    return NextResponse.json({ titles });
  } catch (error) {
    console.error('Generate book title error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
