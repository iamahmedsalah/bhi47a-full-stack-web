'use client';

import React from 'react';
import { cn } from '@/lib/cn';

type TableActionButtonVariant = 'neutral' | 'primary' | 'danger' | 'success';

interface TableActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: TableActionButtonVariant;
}

export function TableActionButton({
  children,
  className,
  variant = 'neutral',
  type = 'button',
  ...props
}: TableActionButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-squircle border px-3 py-1.5 text-xs font-bold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' &&
          'border-primary/30 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground',
        variant === 'danger' &&
          'border-danger/30 bg-danger/10 text-danger hover:bg-danger hover:text-danger-foreground',
        variant === 'success' &&
          'border-success/30 bg-success/10 text-success hover:bg-success hover:text-white',
        variant === 'neutral' &&
          'border-border bg-surface/50 text-muted-foreground hover:border-primary/35 hover:bg-primary/10 hover:text-primary',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
