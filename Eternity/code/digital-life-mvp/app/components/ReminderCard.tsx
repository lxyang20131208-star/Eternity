'use client';

import type { UploadReminder } from '@/lib/types/photos';

interface ReminderCardProps {
  reminder: UploadReminder;
  onUpload: () => void;
  onSnooze: (days: number) => void;
  onDismiss: () => void;
}

export default function ReminderCard({
  reminder,
  onUpload,
  onSnooze,
  onDismiss,
}: ReminderCardProps) {
  const getIcon = () => {
    switch (reminder.reminder_type) {
      case 'welcome':
        return (
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
            </svg>
          </div>
        );
      case 'inactive':
        return (
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      case 'contextual':
        return (
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
    }
  };

  const getTitle = () => {
    switch (reminder.reminder_type) {
      case 'welcome':
        return '欢迎上传照片！';
      case 'inactive':
        return '该添加新照片了';
      case 'contextual':
        return reminder.metadata?.title || '上传相关照片';
    }
  };

  const getMessage = () => {
    switch (reminder.reminder_type) {
      case 'welcome':
        return '上传照片让我们开始记录你的人生故事吧！';
      case 'inactive':
        const days = reminder.metadata?.days_since_last_upload || 0;
        return `你已经 ${days} 天没有上传照片了`;
      case 'contextual':
        if (reminder.metadata?.person_name) {
          return `不妨上传一些关于"${reminder.metadata.person_name}"的照片？`;
        }
        if (reminder.metadata?.event_title) {
          return `上传"${reminder.metadata.event_title}"的相关照片`;
        }
        return '添加相关照片';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100">
      <div className="flex gap-3">
        {getIcon()}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 mb-1">{getTitle()}</h4>
          <p className="text-sm text-gray-600 mb-3">{getMessage()}</p>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={onUpload}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              立即上传
            </button>
            <button
              onClick={() => onSnooze(3)}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              3天后
            </button>
            <button
              onClick={() => onSnooze(7)}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
            >
              1周后
            </button>
            <button
              onClick={onDismiss}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors px-2"
            >
              忽略
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
