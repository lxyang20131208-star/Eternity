/**
 * Nominatim Reverse Geocoding Utility
 * 文档: https://nominatim.org/release-docs/develop/api/Reverse/
 */

// 简单的延时函数，用于限流
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    // 构造请求 URL
    // format=json: 返回 JSON 格式
    // zoom=18: 街道级别精度
    // addressdetails=1: 返回详细地址信息
    // accept-language=zh-CN: 强制返回中文结果
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=zh-CN`;

    const response = await fetch(url, {
      headers: {
        // Nominatim 要求必须提供 User-Agent
        'User-Agent': 'Eternity-Digital-Life/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // 返回显示的名称 (display_name)
    return data.display_name || null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
}

/**
 * 批量处理函数，带有速率限制（每 1.2 秒一个请求）
 */
export async function batchReverseGeocode(
  locations: { id: string; lat: number; lng: number }[],
  onProgress?: (current: number, total: number) => void
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    if (onProgress) onProgress(i + 1, locations.length);

    const address = await reverseGeocode(loc.lat, loc.lng);
    if (address) {
      results[loc.id] = address;
    }

    // Nominatim 免费层限制：绝对最大 1 请求/秒。
    // 我们设置为 1200ms 以确保安全。
    if (i < locations.length - 1) {
      await delay(1200);
    }
  }

  return results;
}
