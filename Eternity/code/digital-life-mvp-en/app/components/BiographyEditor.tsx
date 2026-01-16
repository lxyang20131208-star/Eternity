'use client';

import { useState, useEffect } from 'react';
import type { ExpandedChapter } from '@/lib/chapterApi';

interface BiographyEditorProps {
  chapters: ExpandedChapter[];
  onSave: (chapters: ExpandedChapter[]) => void;
  onClose: () => void;
  authorStyle: string;
}

export function BiographyEditor({ chapters: initialChapters, onSave, onClose, authorStyle }: BiographyEditorProps) {
  const [chapters, setChapters] = useState<ExpandedChapter[]>(initialChapters);
  const [activeChapter, setActiveChapter] = useState<number>(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);

  // Find & Replace state
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceHistory, setReplaceHistory] = useState<Array<{ find: string; replace: string; count: number }>>([]);

  // Update chapter title
  const updateTitle = (index: number, title: string) => {
    const updated = [...chapters];
    updated[index] = { ...updated[index], title };
    setChapters(updated);
    setHasChanges(true);
  };

  // Update chapter content
  const updateContent = (index: number, content: string) => {
    const updated = [...chapters];
    updated[index] = { ...updated[index], content };
    setChapters(updated);
    setHasChanges(true);
  };

  // Delete chapter
  const deleteChapter = (index: number) => {
    const updated = chapters.filter((_, i) => i !== index);
    setChapters(updated);
    setActiveChapter(Math.min(activeChapter, updated.length - 1));
    setHasChanges(true);
    setShowDeleteConfirm(null);
  };

  // Find & Replace all occurrences across all chapters
  const handleFindReplace = () => {
    if (!findText.trim()) return;

    let totalCount = 0;
    const updated = chapters.map(chapter => {
      const titleMatches = (chapter.title.match(new RegExp(findText, 'g')) || []).length;
      const contentMatches = (chapter.content.match(new RegExp(findText, 'g')) || []).length;
      totalCount += titleMatches + contentMatches;

      return {
        ...chapter,
        title: chapter.title.split(findText).join(replaceText),
        content: chapter.content.split(findText).join(replaceText),
      };
    });

    if (totalCount > 0) {
      setChapters(updated);
      setHasChanges(true);
      setReplaceHistory(prev => [...prev, { find: findText, replace: replaceText, count: totalCount }]);
      setFindText('');
      setReplaceText('');
    }

    return totalCount;
  };

  // Count occurrences for preview
  const countOccurrences = (text: string): number => {
    if (!text.trim()) return 0;
    let count = 0;
    chapters.forEach(chapter => {
      count += (chapter.title.match(new RegExp(text, 'g')) || []).length;
      count += (chapter.content.match(new RegExp(text, 'g')) || []).length;
    });
    return count;
  };

  // Move chapter up/down
  const moveChapter = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === chapters.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updated = [...chapters];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setChapters(updated);
    setActiveChapter(newIndex);
    setHasChanges(true);
  };

  // Handle save
  const handleSave = () => {
    onSave(chapters);
    setHasChanges(false);
  };

  // Handle close with unsaved changes warning
  const handleClose = () => {
    if (hasChanges) {
      if (confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const activeChapterData = chapters[activeChapter];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 20px',
          background: '#0a1628',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#fff' }}>
            Biography Editor
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255, 255, 255, 0.6)' }}>
            {chapters.length}  chapters · {authorStyle} style
            {hasChanges && <span style={{ color: '#fbbf24', marginLeft: 8 }}>● Unsaved changes</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setShowFindReplace(!showFindReplace)}
            style={{
              padding: '8px 16px',
              background: showFindReplace ? 'rgba(251, 191, 36, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              border: showFindReplace ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 6,
              color: showFindReplace ? '#fbbf24' : '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            🔍 Find & Replace
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges}
            style={{
              padding: '8px 20px',
              background: hasChanges ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: hasChanges ? 'pointer' : 'not-allowed',
              opacity: hasChanges ? 1 : 0.5,
            }}
          >
            Save Changes
          </button>
          <button
            onClick={handleClose}
            style={{
              padding: '8px 16px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Find & Replace Panel */}
      {showFindReplace && (
        <div
          style={{
            padding: '12px 20px',
            background: 'rgba(251, 191, 36, 0.05)',
            borderBottom: '1px solid rgba(251, 191, 36, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.7)' }}>Find:</label>
            <input
              type="text"
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              placeholder="Enter text to find..."
              style={{
                padding: '6px 12px',
                fontSize: 13,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 4,
                color: '#fff',
                width: 180,
                outline: 'none',
              }}
            />
            {findText && (
              <span style={{ fontSize: 12, color: '#fbbf24' }}>
                Found {countOccurrences(findText)} matches
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.7)' }}>Replace with:</label>
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Enter replacement text..."
              style={{
                padding: '6px 12px',
                fontSize: 13,
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 4,
                color: '#fff',
                width: 180,
                outline: 'none',
              }}
            />
          </div>

          <button
            onClick={() => {
              const count = handleFindReplace();
              if (count === 0) {
                alert('No matching text found');
              }
            }}
            disabled={!findText.trim()}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 600,
              background: findText.trim() ? '#fbbf24' : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: 4,
              color: findText.trim() ? '#000' : 'rgba(255, 255, 255, 0.5)',
              cursor: findText.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            Replace All
          </button>

          {replaceHistory.length > 0 && (
            <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginLeft: 'auto' }}>
              Recent: {replaceHistory.slice(-3).map((h, i) => (
                <span key={i} style={{ marginLeft: 8 }}>
                  「{h.find}」→「{h.replace}」({h.count}matches)
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Chapter List - Left Sidebar */}
        <div
          style={{
            width: 280,
            background: 'rgba(255, 255, 255, 0.02)',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            overflowY: 'auto',
            padding: 12,
          }}
        >
          <div style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginBottom: 12, padding: '0 8px' }}>
            Chapter List
          </div>
          {chapters.map((chapter, idx) => (
            <div
              key={idx}
              onClick={() => setActiveChapter(idx)}
              style={{
                padding: '10px 12px',
                marginBottom: 4,
                background: activeChapter === idx ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                border: activeChapter === idx ? '1px solid rgba(0, 212, 255, 0.3)' : '1px solid transparent',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.5)' }}>
                  Chapter {idx + 1}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveChapter(idx, 'up'); }}
                    disabled={idx === 0}
                    style={{
                      padding: '2px 6px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      borderRadius: 3,
                      color: idx === 0 ? 'rgba(255,255,255,0.2)' : '#fff',
                      fontSize: 10,
                      cursor: idx === 0 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveChapter(idx, 'down'); }}
                    disabled={idx === chapters.length - 1}
                    style={{
                      padding: '2px 6px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      borderRadius: 3,
                      color: idx === chapters.length - 1 ? 'rgba(255,255,255,0.2)' : '#fff',
                      fontSize: 10,
                      cursor: idx === chapters.length - 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ↓
                  </button>
                </div>
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: activeChapter === idx ? '#00d4ff' : '#fff',
                  marginTop: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {chapter.title || 'Untitled Chapter'}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(255, 255, 255, 0.4)',
                  marginTop: 4,
                }}
              >
                {chapter.content.length}  chars
              </div>
            </div>
          ))}
        </div>

        {/* Editor - Main Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeChapterData ? (
            <>
              {/* Chapter Title */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <label style={{ display: 'block', fontSize: 12, color: 'rgba(255, 255, 255, 0.5)', marginBottom: 6 }}>
                 Chapter Title
                </label>
                <input
                  type="text"
                  value={activeChapterData.title}
                  onChange={(e) => updateTitle(activeChapter, e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    fontSize: 16,
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: 6,
                    color: '#fff',
                    outline: 'none',
                  }}
                  placeholder="Enter chapter title..."
                />
              </div>

              {/* Chapter Content */}
              <div style={{ flex: 1, padding: '16px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 12, color: 'rgba(255, 255, 255, 0.5)' }}>
                   Chapter Content ({activeChapterData.content.length}  chars)
                  </label>
                  <button
                    onClick={() => setShowDeleteConfirm(activeChapter)}
                    style={{
                      padding: '4px 12px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: 4,
                      color: '#ef4444',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Delete this chapter
                  </button>
                </div>
                <textarea
                  value={activeChapterData.content}
                  onChange={(e) => updateContent(activeChapter, e.target.value)}
                  style={{
                    flex: 1,
                    width: '100%',
                    padding: 16,
                    fontSize: 14,
                    lineHeight: 1.8,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: 8,
                    color: '#e0e0e0',
                    resize: 'none',
                    outline: 'none',
                    fontFamily: '"Noto Serif SC", Georgia, serif',
                  }}
                  placeholder="Enter chapter content..."
                />
              </div>

              {/* Tips */}
              <div style={{ padding: '12px 24px', background: 'rgba(0, 0, 0, 0.3)', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <p style={{ margin: 0, fontSize: 12, color: 'rgba(255, 255, 255, 0.4)' }}>
                  Tip: You can directly edit text to correct speech recognition errors or delete unwanted paragraphs. Remember to click Save Changes after editing.
                </p>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)' }}>
              Please select a chapter from the left to edit
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1001,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setShowDeleteConfirm(null)}
        >
          <div
            style={{
              background: '#1a1a2e',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 12px', fontSize: 18, color: '#fff' }}>
              Confirm Delete
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'rgba(255, 255, 255, 0.7)' }}>
              Are you sure you want to delete "{chapters[showDeleteConfirm]?.title || 'this chapter'}"? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                style={{
                  padding: '8px 16px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteChapter(showDeleteConfirm)}
                style={{
                  padding: '8px 16px',
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}





