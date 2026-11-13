'use client';
import { useHydrated } from "@/hooks/use-hydrated";

import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button } from './button';

interface ModalProps {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClass = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-5xl',
};

export function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  size = 'md',
  className = '',
}: ModalProps) {
  const mounted = useHydrated();

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  if (!open || !mounted) {
    return null;
  }

  const modalNode = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        className="fixed inset-0 cursor-default bg-black/70 backdrop-blur-md transition-opacity"
        aria-label="Close modal"
        onClick={onClose}
      />
      <div
        className={`relative z-10 w-full ${sizeClass[size]} max-h-[92vh] flex flex-col animate-fade-in rounded-2xl border border-white/10 bg-[#071d24]/95 backdrop-blur-xl shadow-2xl ${className}`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 shrink-0">
          <h3 id="modal-title" className="text-base sm:text-lg font-bold text-foreground">
            {title}
          </h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close modal"
            onClick={onClose}
            className="rounded-squircle text-muted-foreground hover:text-foreground hover:bg-white/10 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scroll p-5 sm:p-6">
          {children}
        </div>
        {footer ? (
          <div className="border-t border-white/10 px-6 py-4 shrink-0 bg-background/30">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
}
