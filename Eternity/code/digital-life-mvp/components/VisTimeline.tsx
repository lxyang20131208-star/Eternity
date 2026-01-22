'use client';

import { useEffect, useRef, useState } from 'react';

interface TimelineEvent {
  id: string;
  content: string;
  start: Date | string;
  end?: Date | string;
  type?: 'box' | 'point' | 'range' | 'background';
  group?: string;
  className?: string;
  style?: string;
}

interface TimelineProps {
  events: TimelineEvent[];
  onEventClick?: (eventId: string) => void;
  selectedEventId?: string;
}

export default function VisTimeline({ events, onEventClick, selectedEventId }: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineInstanceRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !timelineRef.current) return;

    const initTimeline = async () => {
      const vis = await import('vis-timeline/standalone') as any;
      const { Timeline, DataSet } = vis;
      // @ts-ignore
      await import('vis-timeline/styles/vis-timeline-graph2d.css');

      if (timelineInstanceRef.current) {
        timelineInstanceRef.current.destroy();
      }

      // Create DataSet
      const items = new DataSet(events);

      // Timeline options
      const options = {
        width: '100%',
        height: '620px',
        margin: {
          item: {
            horizontal: 10,
            vertical: 20, // Increased vertical spacing for better readability
          },
          axis: 10,
        },
        orientation: 'top',
        stack: true,
        showCurrentTime: true,
        zoomMin: 1000 * 60 * 60 * 24 * 7, // 1 week
        zoomMax: 1000 * 60 * 60 * 24 * 365 * 50, // 50 years
        locale: 'en',
        locales: {
          en: {
            current: 'Current',
            time: 'Time',
          },
        },
        tooltip: {
          followMouse: true,
          overflowMethod: 'cap',
        },
      };

      const timeline = new Timeline(timelineRef.current, items, options);

      // Event click handler
      timeline.on('select', (properties: any) => {
        if (properties.items.length > 0 && onEventClick) {
          onEventClick(properties.items[0]);
        }
      });

      timelineInstanceRef.current = timeline;
      setIsReady(true);
    };

    initTimeline();

    return () => {
      if (timelineInstanceRef.current) {
        timelineInstanceRef.current.destroy();
        timelineInstanceRef.current = null;
      }
    };
  }, []);

  // Update items when events change
  useEffect(() => {
    if (!isReady || !timelineInstanceRef.current) return;

    const updateItems = async () => {
      if (!timelineInstanceRef.current) return;
      const vis = await import('vis-timeline/standalone') as any;
      const { DataSet } = vis;
      const items = new DataSet(events);
      if (!timelineInstanceRef.current) return;
      timelineInstanceRef.current.setItems(items);
    };

    updateItems();
  }, [events, isReady]);

  // Highlight selected event
  useEffect(() => {
    if (!isReady || !timelineInstanceRef.current || !selectedEventId) return;

    const timeline = timelineInstanceRef.current;
    if (!timeline) return;
    timeline.setSelection([selectedEventId], {
      focus: true,
      animation: {
        duration: 500,
        easingFunction: 'easeInOutQuad',
      },
    });
  }, [selectedEventId, isReady]);

  return (
    <div className="relative w-full">
      <div ref={timelineRef} className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm" />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-xl">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-500">加载时间轴...</p>
          </div>
        </div>
      )}
      <style jsx global>{`
        .vis-timeline {
          border: none !important;
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        }
        
        /* Axis styling */
        .vis-time-axis {
          font-size: 12px !important;
          border-bottom: 1px solid #e5e7eb !important;
          background-color: #f9fafb !important;
        }
        .vis-time-axis .vis-text {
          color: #6b7280 !important;
          padding-top: 4px !important;
        }
        .vis-time-axis .vis-grid.vis-minor {
          border-color: #f3f4f6 !important;
        }
        .vis-time-axis .vis-grid.vis-major {
          border-color: #e5e7eb !important;
        }

        /* Item styling */
        .vis-item {
          background-color: #ffffff !important;
          border: 1px solid #e5e7eb !important;
          border-left: 4px solid #f59e0b !important; /* Amber accent */
          border-radius: 6px !important;
          font-size: 13px !important;
          line-height: 1.4 !important;
          color: #1f2937 !important;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
          padding: 2px !important; /* Reset padding to let inner content control it */
          transition: all 0.2s ease !important;
        }

        /* Content inside item */
        .vis-item-content {
          padding: 4px 8px !important;
        }

        /* Hover state */
        .vis-item:hover {
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
          border-color: #d1d5db !important;
          transform: translateY(-1px);
          z-index: 10 !important;
        }

        /* Selected state */
        .vis-item.vis-selected {
          background-color: #fffbeb !important; /* Amber-50 */
          border-color: #f59e0b !important;
          box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2), 0 4px 6px rgba(0, 0, 0, 0.1) !important;
          z-index: 20 !important;
        }

        /* Point items */
        .vis-item.vis-point {
          background-color: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        /* The dot itself for point items */
        .vis-item.vis-dot {
          background-color: #fff !important;
          border: 2px solid #f59e0b !important;
          border-radius: 50% !important;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important;
        }
        .vis-item.vis-selected.vis-dot {
          border-color: #d97706 !important;
          background-color: #fef3c7 !important;
          box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.2) !important;
        }

        /* Connecting lines */
        .vis-item.vis-line {
          border-color: #f59e0b !important;
          border-width: 2px !important;
        }

        /* Current time indicator */
        .vis-current-time {
          background-color: #ef4444 !important;
          width: 2px !important;
          z-index: 1;
        }
        
        /* Custom scrollbar for timeline */
        .vis-panel.vis-center, 
        .vis-panel.vis-left, 
        .vis-panel.vis-right, 
        .vis-panel.vis-top, 
        .vis-panel.vis-bottom {
          /* Hide scrollbars if not needed or style them */
        }
      `}</style>
    </div>
  );
}
