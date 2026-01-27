/**
 * 人物相似度计算工具
 * 用于检测重复或相似的人物记录
 */

import { Person } from '@/lib/types/knowledge-graph';

export interface SimilarityResult {
  score: number; // 0-1之间的相似度分数
  reason: 'exact_alias' | 'alias_match' | 'name_similar' | 'alias_intersection' | 'no_match';
}

/**
 * 主相似度计算函数（四层过滤策略）
 *
 * 算法优先级（从高到低）：
 * 1. 别名精确匹配 - 任意别名完全相同（0.95）
 * 2. 别名包含关系 - 一个别名包含另一个（0.88）
 * 3. 姓名编辑距离 - 拼写相似（0.68-0.85）
 * 4. 别名交集 - 多个别名接近（0.75）
 */
export function calculateSimilarity(personA: Person, personB: Person): SimilarityResult {
  // 构建完整的别名集合（包括主名字）
  // 注意：对名字进行规范化处理，去除空格、全角字符等
  const normalizeString = (s: string): string => {
    return s
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '') // 去除所有空白字符
      .replace(/[\u3000\uFEFF]/g, ''); // 去除全角空格和BOM字符
  };

  const aliasesA = [personA.name, ...(personA.aliases || [])].map(normalizeString);
  const aliasesB = [personB.name, ...(personB.aliases || [])].map(normalizeString);

  // 第一层：别名精确匹配（最高优先级）
  // 注意：直接比较姓名是否相同（完全相同的名字应该被检测为重复）
  const hasExactMatch = aliasesA.some(a => aliasesB.includes(a));
  if (hasExactMatch) {
    console.log(`[Similarity] ✓ Exact match found: "${personA.name}" and "${personB.name}"`);
    console.log(`[Similarity]   aliasesA (normalized): ${JSON.stringify(aliasesA)}`);
    console.log(`[Similarity]   aliasesB (normalized): ${JSON.stringify(aliasesB)}`);
    return { score: 0.95, reason: 'exact_alias' };
  }

  // 第二层：别名包含关系（常见于昵称、简称）
  for (const aliasA of aliasesA) {
    for (const aliasB of aliasesB) {
      // 跳过太短的字符串，避免误匹配
      if (aliasA.length < 2 || aliasB.length < 2) continue;

      if (aliasA.includes(aliasB) || aliasB.includes(aliasA)) {
        return { score: 0.88, reason: 'alias_match' };
      }
    }
  }

  // 第三层：姓名编辑距离（拼写相似，处理输入错误）
  const normalizedNameA = normalizeString(personA.name);
  const normalizedNameB = normalizeString(personB.name);
  const nameSimilarity = levenshteinSimilarity(normalizedNameA, normalizedNameB);

  if (nameSimilarity > 0.8) {
    // 编辑距离相似度乘以0.85作为最终分数
    console.log(`[Similarity] Name similar: "${personA.name}" vs "${personB.name}" (normalized: "${normalizedNameA}" vs "${normalizedNameB}"), similarity=${nameSimilarity}`);
    return { score: nameSimilarity * 0.85, reason: 'name_similar' };
  }

  // 第四层：别名交集（多个别名都接近）
  const similarAliases = aliasesA.filter(aliasA =>
    aliasesB.some(aliasB => {
      // 跳过太短的字符串
      if (aliasA.length < 2 || aliasB.length < 2) return false;
      return levenshteinSimilarity(aliasA, aliasB) > 0.75;
    })
  );

  if (similarAliases.length > 0) {
    return { score: 0.75, reason: 'alias_intersection' };
  }

  // 无匹配
  return { score: 0, reason: 'no_match' };
}

/**
 * Levenshtein距离标准化为0-1相似度
 * 相似度 = 1 - (编辑距离 / 最大长度)
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLen = Math.max(str1.length, str2.length);

  if (maxLen === 0) return 1; // 两个空字符串视为完全相同

  return 1 - (distance / maxLen);
}

/**
 * Levenshtein距离计算（编辑距离）
 * 使用动态规划计算从str1变换到str2需要的最少编辑操作数
 *
 * @param str1 - 第一个字符串
 * @param str2 - 第二个字符串
 * @returns 编辑距离（整数）
 */
function levenshteinDistance(str1: string, str2: string): number {
  // 创建矩阵（行数 = str2.length+1, 列数 = str1.length+1）
  const matrix: number[][] = [];

  // 初始化第一列（从空字符串到str2的各个前缀）
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  // 初始化第一行（从空字符串到str1的各个前缀）
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  // 填充矩阵
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        // 字符相同，无需操作
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        // 字符不同，取三种操作的最小值
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,  // 替换
          matrix[i][j - 1] + 1,      // 插入
          matrix[i - 1][j] + 1       // 删除
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * 并查集（Union-Find）数据结构
 * 用于合并具有传递关系的人物组（A~B, B~C → {A, B, C}为一组）
 */
export class UnionFind {
  private parent: Map<string, string>;
  private rank: Map<string, number>;

  constructor() {
    this.parent = new Map();
    this.rank = new Map();
  }

  /**
   * 查找元素的根节点（带路径压缩）
   */
  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
      return x;
    }

    // 路径压缩：直接连接到根节点
    if (this.parent.get(x) !== x) {
      this.parent.set(x, this.find(this.parent.get(x)!));
    }

    return this.parent.get(x)!;
  }

  /**
   * 合并两个元素所在的集合（按秩合并）
   */
  union(x: string, y: string): void {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return; // 已经在同一集合

    // 按秩合并：将较小的树连接到较大的树
    const rankX = this.rank.get(rootX) || 0;
    const rankY = this.rank.get(rootY) || 0;

    if (rankX < rankY) {
      this.parent.set(rootX, rootY);
    } else if (rankX > rankY) {
      this.parent.set(rootY, rootX);
    } else {
      this.parent.set(rootY, rootX);
      this.rank.set(rootX, rankX + 1);
    }
  }

  /**
   * 获取所有连通分量（组）
   * @returns Map<根节点, 成员数组>
   */
  getGroups(): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const [element] of this.parent) {
      const root = this.find(element);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(element);
    }

    return groups;
  }
}

/**
 * 批量检测相似人物对
 *
 * @param people - 人物列表
 * @param threshold - 相似度阈值（默认0.7）
 * @returns 相似人物对数组
 */
export function detectSimilarPairs(
  people: Person[],
  threshold: number = 0.7
): Array<{
  personAId: string;
  personBId: string;
  similarity: number;
  reason: string;
}> {
  const pairs: Array<{
    personAId: string;
    personBId: string;
    similarity: number;
    reason: string;
  }> = [];

  console.log(`[detectSimilarPairs] Starting with ${people.length} people, threshold=${threshold}`);

  // 两两比对（时间复杂度 O(n²)，适用于中小规模数据）
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const personA = people[i];
      const personB = people[j];

      // 跳过已被合并的人物（extraction_status 在顶层，不在 metadata 内）
      if (personA.extraction_status === 'merged' ||
          personB.extraction_status === 'merged') {
        console.log(`[detectSimilarPairs] Skipping merged: "${personA.name}" (${personA.extraction_status}) or "${personB.name}" (${personB.extraction_status})`);
        continue;
      }

      const result = calculateSimilarity(personA, personB);

      // 打印所有比较结果（用于调试）
      if (result.score > 0 || personA.name === personB.name) {
        console.log(`[detectSimilarPairs] Comparing "${personA.name}" vs "${personB.name}": score=${result.score}, reason=${result.reason}`);
      }

      if (result.score >= threshold) {
        console.log(`[detectSimilarPairs] ✓ Found duplicate pair: "${personA.name}" and "${personB.name}" (score=${result.score})`);
        pairs.push({
          personAId: personA.id,
          personBId: personB.id,
          similarity: result.score,
          reason: result.reason
        });
      }
    }
  }

  console.log(`[detectSimilarPairs] Found ${pairs.length} pairs total`);

  // 按相似度降序排序
  pairs.sort((a, b) => b.similarity - a.similarity);

  return pairs;
}

/**
 * 使用并查集合并具有传递关系的人物组
 *
 * @param pairs - 相似人物对
 * @returns 人物组数组
 */
export function groupSimilarPeople(
  pairs: Array<{ personAId: string; personBId: string }>
): string[][] {
  const uf = new UnionFind();

  // 合并所有相似对
  for (const pair of pairs) {
    uf.union(pair.personAId, pair.personBId);
  }

  // 获取所有组
  const groups = uf.getGroups();

  // 转换为数组格式，并过滤单个元素的组
  return Array.from(groups.values()).filter(group => group.length > 1);
}
