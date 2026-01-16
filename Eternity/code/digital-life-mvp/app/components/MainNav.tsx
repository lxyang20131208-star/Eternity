'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function MainNav() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: '🏠 首页', icon: '🏠' },
    { href: '/family', label: '👥 人物', icon: '👥' },
    { href: '/timeline', label: '📅 时间轴', icon: '📅' },
    { href: '/places', label: '🗺️ 地图', icon: '🗺️' },
    { href: '/extract', label: '🤖 AI抽取', icon: '🤖' },
    { href: '/today', label: '💭 今日对话', icon: '💭' },
    { href: '/outline', label: '📖 大纲', icon: '📖' },
    { href: '/export', label: '📦 导出', icon: '📦' },
  ];

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">📚</span>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              永恒档案
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-md'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  <span className="mr-1">{item.icon}</span>
                  {item.label.split(' ')[1]}
                </Link>
              );
            })}
          </div>

          {/* User Menu (placeholder) */}
          <div className="flex items-center gap-2">
            <button className="p-2 rounded-lg hover:bg-gray-100">
              <span className="text-xl">👤</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
