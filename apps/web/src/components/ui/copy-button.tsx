'use client';

import React, { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';

interface CopyButtonProps {
  /** Value to copy to clipboard */
  value: string;
  /** Label text shown next to icon */
  label?: string;
  /** Toast message shown on copy */
  successMessage?: string;
  /** Extra classNames */
  className?: string;
}

/**
 * Clipboard copy button with visual feedback.
 * Shows a check icon briefly after copy, plus a toast.
 */
export function CopyButton({
  value,
  label,
  successMessage = 'تم النسخ',
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(successMessage);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('فشل النسخ');
    }
  }, [value, successMessage]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={label || 'نسخ'}
      aria-label={label || 'نسخ'}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-squircle border text-xs font-semibold transition-all shadow-xs cursor-pointer',
        label ? 'px-2.5 py-1.5' : 'p-1.5 h-7 w-7',
        copied
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500'
          : 'border-border/80 bg-background/80 text-foreground hover:border-primary/50 hover:bg-background hover:text-primary',
        className,
      )}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {label && <span className="font-semibold">{label}</span>}
    </button>
  );
}
