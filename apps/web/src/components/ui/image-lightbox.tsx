'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  Download,
  ExternalLink,
  Move,
} from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface ImageLightboxProps {
  src: string | null | undefined;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export function ImageLightbox({
  src,
  alt = 'Image Preview',
  isOpen,
  onClose,
  title,
}: ImageLightboxProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const positionRef = useRef({ x: 0, y: 0 });

  // Sync positionRef with position state
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Reset transform state whenever image opens or changes
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      // Prevent body scrolling while lightbox is active
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, src]);

  // Handle keyboard shortcuts (Esc, +, -, 0)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setScale((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 4));
      } else if (e.key === '-' || e.key === '_') {
        setScale((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.5));
      } else if (e.key === '0') {
        setScale(1);
        setPosition({ x: 0, y: 0 });
        setRotation(0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(Number((prev + 0.25).toFixed(2)), 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(Number((prev - 0.25).toFixed(2)), 0.5));
  }, []);

  const handleReset = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((prev) => (prev + 90) % 360);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(Number((prev + 0.2).toFixed(2)), 4));
    } else {
      setScale((prev) => Math.max(Number((prev - 0.2).toFixed(2)), 0.5));
    }
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (scale > 1) {
      handleReset();
    } else {
      setScale(2);
    }
  }, [scale, handleReset]);

  // Pointer drag events for panning
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only allow left click / single touch drag
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - positionRef.current.x,
      y: e.clientY - positionRef.current.y,
    };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setPosition({
      x: Math.round(e.clientX - dragStartRef.current.x),
      y: Math.round(e.clientY - dragStartRef.current.y),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
  };

  const handleDownload = () => {
    if (!src) return;
    const link = document.createElement('a');
    link.href = src;
    link.download = `complaint-attachment-${Date.now()}.png`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !src) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-black/90 backdrop-blur-md animate-in fade-in-0 duration-200 select-none"
      onClick={(e) => {
        // Close if clicked directly on the outer backdrop container
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Top Header Bar */}
      <div className="flex w-full items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm text-white/90">
            {title || alt}
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-mono font-bold text-teal-300">
            {Math.round(scale * 100)}%
          </span>
          {rotation > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-mono text-white/60">
              {rotation}°
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10 rounded-squircle"
            title="تحميل الصورة / Download"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => window.open(src, '_blank')}
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10 rounded-squircle"
            title="فتح في نافذة جديدة / Open Original"
          >
            <ExternalLink className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-9 w-9 text-white/80 hover:text-white hover:bg-rose-500/20 hover:text-rose-300 rounded-squircle ml-2"
            title="إغلاق / Close (Esc)"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div
        className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            transition: isDragging ? 'none' : 'transform 150ms cubic-bezier(0.2, 0, 0, 1)',
            transformOrigin: 'center center',
          }}
          className="max-w-[90vw] max-h-[80vh] flex items-center justify-center pointer-events-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-2xl drop-shadow-2xl border border-white/10"
          />
        </div>

        {/* Drag Hint Overlay (fades out) */}
        {scale > 1 && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none rounded-full bg-black/60 border border-white/10 px-3 py-1 text-[11px] text-white/70 backdrop-blur-sm flex items-center gap-1.5 animate-in fade-in-0">
            <Move className="h-3.5 w-3.5 text-teal-400" />
            <span>اسحب للتحريك • انقر نقراً مزدوجاً لإعادة الضبط</span>
          </div>
        )}
      </div>

      {/* Floating Bottom Toolbar */}
      <div className="pb-6 z-10">
        <div className="flex items-center gap-1.5 rounded-2xl border border-white/15 bg-black/70 px-3 py-2 backdrop-blur-xl shadow-2xl">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/15 rounded-xl disabled:opacity-40"
            title="تصغير / Zoom Out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 px-2.5 text-xs font-mono font-bold text-teal-300 hover:text-teal-200 hover:bg-white/15 rounded-xl"
            title="إعادة ضبط الحجم / Reset (0)"
          >
            {Math.round(scale * 100)}%
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={scale >= 4}
            className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/15 rounded-xl disabled:opacity-40"
            title="تكبير / Zoom In (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="h-4 w-[1px] bg-white/20 mx-1" />

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleRotate}
            className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/15 rounded-xl"
            title="تدوير 90 درجة / Rotate"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={handleReset}
            className="h-8 w-8 text-white/90 hover:text-white hover:bg-white/15 rounded-xl"
            title="إعادة الوضع الافتراضي / Reset View"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
