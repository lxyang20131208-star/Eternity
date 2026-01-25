'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AuthErrorHandler() {
  useEffect(() => {
    const handleAuthError = async () => {
      try {
        // 主动检查 Session 状态
        const { error } = await supabase.auth.getSession()
        
        // 如果检测到 Refresh Token 错误
        if (error && (
          error.message.includes('Refresh Token Not Found') || 
          error.message.includes('Invalid Refresh Token')
        )) {
          console.warn('检测到无效的 Auth Session，正在自动清理...')
          
          // 强制登出以清理无效的本地存储数据
          await supabase.auth.signOut()
          
          // 可选：刷新页面以重置状态
          // window.location.reload()
        }
      } catch (e) {
        console.error('Auth 检查异常:', e)
      }
    }

    handleAuthError()
  }, [])

  return null
}
