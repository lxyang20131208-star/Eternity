'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface BookCoverGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  bookTitle: string;
  authorName: string;
  projectId: string | null;
}

export default function BookCoverGenerator({
  isOpen,
  onClose,
  bookTitle,
  authorName,
  projectId,
}: BookCoverGeneratorProps) {
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [showAISection, setShowAISection] = useState(false);
  const [showPresetSection, setShowPresetSection] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 预设背景模板
  const presetBackgrounds = [
    { name: '深蓝夜空', gradient: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 50%, #3b82f6 100%)' },
    { name: '温暖日落', gradient: 'linear-gradient(135deg, #be123c 0%, #e11d48 50%, #f59e0b 100%)' },
    { name: '森林绿意', gradient: 'linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)' },
    { name: '复古棕色', gradient: 'linear-gradient(135deg, #431407 0%, #78350f 50%, #a16207 100%)' },
    { name: '优雅紫色', gradient: 'linear-gradient(135deg, #4c1d95 0%, #6d28d9 50%, #8b5cf6 100%)' },
    { name: '海洋蓝', gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 50%, #0ea5e9 100%)' },
    { name: '暗夜黑', gradient: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)' },
    { name: '玫瑰金', gradient: 'linear-gradient(135deg, #881337 0%, #be123c 50%, #e11d48 100%)' },
  ];

  if (!isOpen) return null;

  // 处理图片上传
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('请上传图片文件');
      return;
    }

    setUploadedFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setCoverImage(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 选择预设背景
  const handlePresetSelect = (gradient: string) => {
    // 创建一个临时 canvas 来生成渐变图片
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 800;
    tempCanvas.height = 1200;
    const ctx = tempCanvas.getContext('2d');

    if (ctx) {
      // 解析渐变字符串并绘制
      const gradientMatch = gradient.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);
      if (gradientMatch) {
        const [, , colors] = gradientMatch;
        const colorStops = colors.split(',').map(c => c.trim());

        // 创建渐变
        const grad = ctx.createLinearGradient(0, 0, tempCanvas.width, tempCanvas.height);
        colorStops.forEach((stop, idx) => {
          const parts = stop.split(/\s+/);
          const color = parts[0];
          const position = parts[1] ? parseFloat(parts[1]) / 100 : idx / (colorStops.length - 1);
          grad.addColorStop(position, color);
        });

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
      }

      // 转换为 data URL
      const dataUrl = tempCanvas.toDataURL('image/png');
      setCoverImage(dataUrl);
      setShowPresetSection(false);
    }
  };

  // 使用 AI 生成图片（调用 Gemini API）
  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) {
      alert('请输入图片描述');
      return;
    }

    setIsGeneratingAI(true);
    try {
      // 调用 Supabase Edge Function 生成图片
      const { data, error } = await supabase.functions.invoke('generate-cover-image', {
        body: {
          prompt: aiPrompt,
          bookTitle,
          authorName,
        },
      });

      if (error) throw error;

      if (data?.imageUrl) {
        setCoverImage(data.imageUrl);
        setShowAISection(false);
        setAiPrompt('');
      } else {
        throw new Error('未收到图片数据');
      }
    } catch (error: any) {
      console.error('AI 生成失败:', error);
      alert('AI 生成功能暂时不可用，请使用"选择预设背景"或"上传图片"功能。\n\n技术信息: ' + (error.message || '未知错误'));
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // 在画布上绘制封面预览
  const generateCoverPreview = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 设置画布尺寸（A5 比例，分辨率适合打印）
    canvas.width = 1748;  // 148mm * 300dpi / 25.4
    canvas.height = 2480; // 210mm * 300dpi / 25.4

    // 绘制背景（如果有图片）
    if (coverImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = coverImage;

      return new Promise<Blob | null>((resolve) => {
        img.onload = () => {
          // 绘制图片（覆盖整个画布）
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // 添加半透明遮罩以确保文字可读
          const gradient = ctx.createLinearGradient(0, canvas.height * 0.5, 0, canvas.height);
          gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
          gradient.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // 绘制标题
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 120px "Noto Serif SC", serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          // 自动换行标题
          const maxWidth = canvas.width * 0.8;
          const lineHeight = 150;
          const titleY = canvas.height * 0.4;
          wrapText(ctx, bookTitle, canvas.width / 2, titleY, maxWidth, lineHeight);

          // 绘制作者名
          ctx.font = '60px "Noto Serif SC", serif';
          ctx.fillText(authorName, canvas.width / 2, canvas.height * 0.85);

          // 转换为 Blob
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        };

        img.onerror = () => {
          resolve(null);
        };
      });
    } else {
      // 纯色背景
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#2C3E50');
      gradient.addColorStop(1, '#1A252F');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制标题
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 120px "Noto Serif SC", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const maxWidth = canvas.width * 0.8;
      const lineHeight = 150;
      const titleY = canvas.height * 0.4;
      wrapText(ctx, bookTitle, canvas.width / 2, titleY, maxWidth, lineHeight);

      // 绘制作者名
      ctx.font = '60px "Noto Serif SC", serif';
      ctx.fillText(authorName, canvas.width / 2, canvas.height * 0.85);

      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob);
        }, 'image/png');
      });
    }
  };

  // 文字自动换行辅助函数
  const wrapText = (
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) => {
    const words = text.split('');
    let line = '';
    let lineCount = 0;
    const lines: string[] = [];

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i];
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && i > 0) {
        lines.push(line);
        line = words[i];
      } else {
        line = testLine;
      }
    }
    lines.push(line);

    // 居中绘制所有行
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      ctx.fillText(line, x, startY + index * lineHeight);
    });
  };

  // 保存封面
  const handleSaveCover = async () => {
    if (!projectId) {
      alert('项目ID未找到');
      return;
    }

    setIsSaving(true);
    try {
      const blob = await generateCoverPreview();
      if (!blob) {
        throw new Error('生成封面预览失败');
      }

      // 上传到 Supabase Storage
      const timestamp = Date.now();
      const fileName = `cover_${timestamp}.png`;
      const storagePath = `covers/${projectId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('biography-exports')
        .upload(storagePath, blob, {
          contentType: 'image/png',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('biography-exports')
        .getPublicUrl(storagePath);

      // 保存封面 URL 到本地存储或数据库
      localStorage.setItem('bookCoverUrl', urlData.publicUrl);

      alert('✅ 封面已保存！');
      onClose();
    } catch (error: any) {
      console.error('保存封面失败:', error);
      alert('保存失败: ' + (error.message || '未知错误'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 16,
          padding: 32,
          maxWidth: 900,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 24, marginBottom: 24, color: '#111827', fontWeight: 600 }}>
          📚 生成图书封面
        </h2>

        {/* 预览区域 */}
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: 16, marginBottom: 16, color: '#4B5563' }}>封面预览</h3>
          <div
            style={{
              background: coverImage ? `url(${coverImage})` : '#F3F4F6',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              borderRadius: 8,
              padding: '60px 40px',
              minHeight: 400,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
              border: '1px dashed #D1D5DB',
            }}
          >
            {/* 遮罩层确保文字可读 */}
            {coverImage && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)',
                  borderRadius: 8,
                }}
              />
            )}

            {!coverImage && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF' }}>
                暂无图片
              </div>
            )}

            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
              <h1
                style={{
                  fontSize: 48,
                  fontWeight: 700,
                  color: coverImage ? '#FFFFFF' : '#374151',
                  marginBottom: 120,
                  textShadow: coverImage ? '2px 2px 4px rgba(0,0,0,0.5)' : 'none',
                }}
              >
                {bookTitle}
              </h1>
              <p
                style={{
                  fontSize: 24,
                  color: coverImage ? '#E5E5E0' : '#6B7280',
                  textShadow: coverImage ? '1px 1px 2px rgba(0,0,0,0.5)' : 'none',
                }}
              >
                {authorName}
              </p>
            </div>
          </div>
        </div>

        {/* 操作区域 */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, marginBottom: 16, color: '#4B5563' }}>选择封面图片</h3>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {/* 上传图片按钮 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                flex: 1,
                padding: '14px 20px',
                background: '#FFFFFF',
                border: '1px solid #D1D5DB',
                borderRadius: 8,
                color: '#374151',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F9FAFB';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#FFFFFF';
              }}
            >
              📤 上传图片
            </button>

            {/* AI 生成按钮 */}
            <button
              onClick={() => setShowAISection(!showAISection)}
              style={{
                flex: 1,
                padding: '14px 20px',
                background: showAISection ? '#EEF2FF' : '#FFFFFF',
                border: showAISection ? '1px solid #818CF8' : '1px solid #D1D5DB',
                borderRadius: 8,
                color: showAISection ? '#4F46E5' : '#374151',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!showAISection) e.currentTarget.style.background = '#F9FAFB';
              }}
              onMouseLeave={(e) => {
                if (!showAISection) e.currentTarget.style.background = '#FFFFFF';
              }}
            >
              ✨ AI 生成图片
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />

          {/* AI 生成区域 */}
          {showAISection && (
            <div
              style={{
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: 8,
                padding: 20,
                marginTop: 16,
              }}
            >
              <label style={{ display: 'block', marginBottom: 8, color: '#374151', fontSize: 14, fontWeight: 500 }}>
                描述你想要的封面图片
              </label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="例如：一本古朴的书籍，背景是温暖的日落，有复古的纹理..."
                style={{
                  width: '100%',
                  minHeight: 100,
                  padding: 12,
                  background: '#FFFFFF',
                  border: '1px solid #D1D5DB',
                  borderRadius: 6,
                  color: '#111827',
                  fontSize: 14,
                  resize: 'vertical',
                  outline: 'none',
                }}
                onFocus={(e) => e.target.style.borderColor = '#6366F1'}
                onBlur={(e) => e.target.style.borderColor = '#D1D5DB'}
              />
              <button
                onClick={handleAIGenerate}
                disabled={isGeneratingAI || !aiPrompt.trim()}
                style={{
                  marginTop: 12,
                  padding: '10px 20px',
                  background: isGeneratingAI || !aiPrompt.trim() ? '#E5E7EB' : '#4F46E5',
                  border: 'none',
                  borderRadius: 6,
                  color: isGeneratingAI || !aiPrompt.trim() ? '#9CA3AF' : '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isGeneratingAI || !aiPrompt.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {isGeneratingAI ? (
                  <>
                    <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                    AI 生成中...
                  </>
                ) : (
                  <>🎨 生成图片</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px 20px',
              background: '#FFFFFF',
              border: '1px solid #D1D5DB',
              borderRadius: 8,
              color: '#374151',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#F3F4F6'}
            onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
          >
            取消
          </button>
          <button
            onClick={handleSaveCover}
            disabled={isSaving}
            style={{
              flex: 2,
              padding: '14px 20px',
              background: isSaving ? '#9CA3AF' : '#B89B72',
              border: 'none',
              borderRadius: 8,
              color: '#FFFFFF',
              fontSize: 14,
              fontWeight: 600,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            onMouseEnter={(e) => {
              if (!isSaving) e.currentTarget.style.background = '#A89070';
            }}
            onMouseLeave={(e) => {
              if (!isSaving) e.currentTarget.style.background = '#B89B72';
            }}
          >
            {isSaving ? (
              <>
                <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⏳</span>
                保存中...
              </>
            ) : (
              <>💾 保存封面</>
            )}
          </button>
        </div>

        {/* 隐藏的画布用于生成高质量封面 */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>

      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}