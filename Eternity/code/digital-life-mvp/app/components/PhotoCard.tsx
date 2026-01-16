import type { Photo } from '@/lib/types/photos';
import Link from 'next/link';

interface PhotoCardProps {
  photo: Photo;
  selected?: boolean;
  onSelect?: (photoId: string) => void;
  showStatus?: boolean;
}

export default function PhotoCard({
  photo,
  selected = false,
  onSelect,
  showStatus = false,
}: PhotoCardProps) {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="group relative bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all">
      {/* 选择框 */}
      {onSelect && (
        <div className="absolute top-2 left-2 z-10">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(photo.id);
            }}
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
              selected
                ? 'bg-blue-600 border-blue-600'
                : 'bg-white/80 border-white hover:border-blue-400'
            }`}
          >
            {selected && (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* 状态标记 */}
      {showStatus && !photo.is_sorted && (
        <div className="absolute top-2 right-2 z-10">
          <span className="px-2 py-1 bg-orange-500 text-white text-xs rounded-full font-medium">
            待整理
          </span>
        </div>
      )}

      {/* 照片 */}
      <Link href={`/photos/${photo.id}`} className="block aspect-square bg-gray-100">
        <img
          src={photo.thumb_url || photo.url}
          alt={photo.title || '照片'}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </Link>

      {/* 信息覆盖层（悬停显示） */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="absolute bottom-0 left-0 right-0 p-3">
          {photo.title && (
            <p className="text-white text-sm font-medium truncate mb-1">
              {photo.title}
            </p>
          )}
          {photo.taken_at && (
            <p className="text-white/80 text-xs">
              {formatDate(photo.taken_at)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
