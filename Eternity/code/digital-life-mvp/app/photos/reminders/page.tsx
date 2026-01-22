'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getActiveReminders, updateReminderStatus } from '@/lib/photosApi';
import type { UploadReminder } from '@/lib/types/photos';

export default function RemindersPage() {
  const router = useRouter();
  const [reminders, setReminders] = useState<UploadReminder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    setLoading(true);
    try {
      const projectId = 'YOUR_PROJECT_ID'; // TODO: 从session获取
      const data = await getActiveReminders(projectId);
      setReminders(data);
    } catch (error) {
      console.error('Failed to load reminders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSnooze = async (reminderId: string, days: number) => {
    try {
      const snoozeUntil = new Date();
      snoozeUntil.setDate(snoozeUntil.getDate() + days);

      await updateReminderStatus(reminderId, 'snoozed', snoozeUntil.toISOString());

      await loadReminders();
    } catch (error) {
      console.error('Failed to snooze reminder:', error);
    }
  };

  const handleDismiss = async (reminderId: string) => {
    try {
      await updateReminderStatus(reminderId, 'dismissed');
      await loadReminders();
    } catch (error) {
      console.error('Failed to dismiss reminder:', error);
    }
  };

  const handleComplete = async (reminderId: string) => {
    try {
      await updateReminderStatus(reminderId, 'completed');
      router.push('/photos/');
    } catch (error) {
      console.error('Failed to complete reminder:', error);
    }
  };

  const getReminderIcon = (type: string) => {
    switch (type) {
      case 'welcome':
        return (
          <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
          </svg>
        );
      case 'inactive':
        return (
          <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'contextual':
        return (
          <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getReminderTitle = (reminder: UploadReminder) => {
    switch (reminder.reminder_type) {
      case 'welcome':
        return '欢迎上传照片！';
      case 'inactive':
        return '该添加新照片了';
      case 'contextual':
        return reminder.metadata?.title || '上传相关照片';
      default:
        return '上传照片';
    }
  };

  const getReminderMessage = (reminder: UploadReminder) => {
    switch (reminder.reminder_type) {
      case 'welcome':
        return '上传照片让我们开始记录你的人生故事吧！我们建议从家庭相册开始。';
      case 'inactive':
        const daysSince = reminder.metadata?.days_since_last_upload || 0;
        return `你已经 ${daysSince} 天没有上传照片了。定期添加照片可以让回忆更加完整。`;
      case 'contextual':
        if (reminder.metadata?.person_name) {
          return `你最近提到了"${reminder.metadata.person_name}"，不妨上传一些相关的照片？`;
        }
        if (reminder.metadata?.event_title) {
          return `关于"${reminder.metadata.event_title}"，有相关照片想要上传吗？`;
        }
        return '添加相关照片让故事更生动';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-semibold text-gray-900">照片提醒</h1>
          <button
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-900"
          >
            返回
          </button>
        </div>

        {reminders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <svg
              className="mx-auto h-16 w-16 text-gray-300 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              没有待处理的提醒
            </h3>
            <p className="text-gray-500">
              所有提醒都已处理完毕！
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reminders.map((reminder) => (
              <div
                key={reminder.id}
                className="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  {/* 图标 */}
                  <div className="flex-shrink-0">
                    {getReminderIcon(reminder.reminder_type)}
                  </div>

                  {/* 内容 */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {getReminderTitle(reminder)}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {getReminderMessage(reminder)}
                    </p>

                    {/* 操作按钮 */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleComplete(reminder.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                      >
                        立即上传
                      </button>
                      <button
                        onClick={() => handleSnooze(reminder.id, 3)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        3天后提醒
                      </button>
                      <button
                        onClick={() => handleSnooze(reminder.id, 7)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        1周后提醒
                      </button>
                      <button
                        onClick={() => handleDismiss(reminder.id)}
                        className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
                      >
                        忽略
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
