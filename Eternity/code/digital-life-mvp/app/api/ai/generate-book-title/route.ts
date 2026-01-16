import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { outlineData, personName } = await request.json();
    
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // 构建提示词
    let prompt = '请为以下传记生成3个富有吸引力和文学性的书名建议。\n\n';
    
    if (personName) {
      prompt += `传记主人公：${personName}\n\n`;
    }
    
    if (outlineData?.sections && outlineData.sections.length > 0) {
      prompt += '传记章节概要：\n';
      outlineData.sections.slice(0, 5).forEach((section: any, idx: number) => {
        prompt += `${idx + 1}. ${section.title}\n`;
      });
      prompt += '\n';
    }
    
    prompt += `要求：
1. 书名要体现传记的主题和核心价值
2. 要有文学性和感染力
3. 长度适中（4-12个字）
4. 可以是抒情式、叙事式或哲理式
5. 每个建议单独一行，格式：书名 - 简短说明

示例格式：
岁月如歌 - 温情回顾一生的美好时光
时光的印记 - 记录生命中的重要瞬间
人生如戏 - 展现跌宕起伏的人生经历`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '你是一位经验丰富的编辑和文学顾问，擅长为传记、回忆录等作品起标题。你的书名总是富有文学性、感染力，能准确传达作品的主题。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return NextResponse.json(
        { error: 'Failed to generate titles' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content || '';
    
    // 解析生成的书名
    const titles = content
      .split('\n')
      .filter((line: string) => line.trim() && !line.startsWith('要求') && !line.startsWith('示例'))
      .map((line: string) => {
        const match = line.match(/^[\d.、-]*\s*(.+?)\s*[-–—]\s*(.+)$/);
        if (match) {
          return {
            title: match[1].trim(),
            description: match[2].trim(),
          };
        }
        return {
          title: line.replace(/^[\d.、-]*\s*/, '').trim(),
          description: '',
        };
      })
      .filter((item: any) => item.title.length >= 2 && item.title.length <= 20)
      .slice(0, 3);

    return NextResponse.json({ titles });
  } catch (error) {
    console.error('Generate book title error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
