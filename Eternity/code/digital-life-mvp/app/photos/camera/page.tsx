'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { uploadPhoto } from '@/lib/photoUpload';
import { createPhoto } from '@/lib/photosApi';

export default function CameraCapturePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'environment' | 'user'>('environment'); // 后置摄像头

  // 启动摄像头
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [cameraMode]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err) {
      console.error('Failed to start camera:', err);
      setError('无法访问摄像头，请检查权限设置');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  // 拍照
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageData);
    stopCamera(); // 暂停摄像头预览
  };

  // 重拍
  const retake = () => {
    setCapturedImage(null);
    startCamera();
  };

  // 上传照片
  const uploadCapturedPhoto = async () => {
    if (!capturedImage) return;

    setIsUploading(true);
    try {
      // 将base64转为Blob
      const response = await fetch(capturedImage);
      const blob = await response.blob();
      const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });

      // 上传
      const projectId = 'YOUR_PROJECT_ID'; // TODO: 从session获取
      const result = await uploadPhoto(file, projectId, {
        generateThumbnail: true,
        extractExif: true,
      });

      // 创建数据库记录，标记为扫描来源
      await createPhoto({
        ...result.photo,
        source: 'scan',
        title: '扫描的照片',
      });

      router.push('/photos');
    } catch (err) {
      console.error('Upload failed:', err);
      alert('上传失败，请重试');
    } finally {
      setIsUploading(false);
    }
  };

  // 切换前后摄像头
  const toggleCamera = () => {
    setCameraMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="fixed inset-0 bg-black">
      {/* 顶部工具栏 */}
      <header className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center justify-between px-4 py-4">
          <button
            onClick={() => router.back()}
            className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {!capturedImage && (
            <button
              onClick={toggleCamera}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* 摄像头预览/拍摄结果 */}
      <div className="w-full h-full flex items-center justify-center">
        {capturedImage ? (
          <img
            src={capturedImage}
            alt="Captured"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            {error && (
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <div className="bg-red-900/80 backdrop-blur-xl rounded-2xl p-6 text-white text-center">
                  <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p>{error}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 隐藏的canvas用于拍照 */}
      <canvas ref={canvasRef} className="hidden" />

      {/* 底部提示 */}
      {!capturedImage && (
        <div className="absolute bottom-32 left-0 right-0 z-10 px-8">
          <div className="bg-black/60 backdrop-blur-xl rounded-2xl p-4 text-white text-center">
            <p className="text-sm">
              💡 将相机对准纸质老照片，尽量保持平整和光线充足
            </p>
          </div>
        </div>
      )}

      {/* 底部按钮 */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/60 to-transparent pb-8">
        <div className="flex items-center justify-center gap-8 px-8">
          {capturedImage ? (
            <>
              <button
                onClick={retake}
                disabled={isUploading}
                className="px-8 py-3 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
              >
                重拍
              </button>
              <button
                onClick={uploadCapturedPhoto}
                disabled={isUploading}
                className="px-8 py-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    上传中...
                  </>
                ) : (
                  '使用照片'
                )}
              </button>
            </>
          ) : (
            <button
              onClick={capturePhoto}
              disabled={!stream || !!error}
              className="w-20 h-20 bg-white rounded-full border-4 border-gray-300 hover:border-blue-500 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              <div className="w-16 h-16 bg-white rounded-full" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
