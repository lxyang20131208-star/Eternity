import { supabase } from './supabaseClient';

export interface Question {
  id: string;
  text: string;
  scope: 'global' | 'user' | 'trial';  // trial 用于 draft 页面的试用问题
  owner_user_id?: string;
  created_at: string;
}

/**
 * 获取问题列表（排除 trial 问题）
 * - scope = 'global': 核心问题（100个）
 * - scope = 'user': 用户自定义问题（通过 RLS 只能看到自己的）
 * - scope = 'trial': 试用问题（不会被返回）
 */
export async function getQuestions(projectId: string): Promise<Question[]> {
  // RLS 策略会自动过滤：
  // - 所有 scope = 'global' 的问题
  // - 当前用户的 scope = 'user' 问题
  // 我们额外在查询中排除 'trial' 问题，确保它们不会出现在主问题列表中

  const { data, error } = await supabase
    .from('questions')
    .select('*')
    .in('scope', ['global', 'user'])  // 明确排除 trial 问题
    .order('id');

  if (error) throw error;
  return data || [];
}
