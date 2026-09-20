'use client';

import React from 'react';
import { cn } from '@/lib/cn';

type BadgeVariant =
  | 'success'
  | 'danger'
  | 'warning'
  | 'info'
  | 'neutral'
  | 'primary';

interface StatusBadgeProps {
  /** Display text */
  label: string;
  /** Color variant */
  variant: BadgeVariant;
  /** Whether the badge is clickable */
  onClick?: () => void;
  /** Extra classNames */
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  success:
    'bg-success/15 border-success/30 text-success',
  danger:
    'bg-danger/15 border-danger/30 text-danger',
  warning:
    'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
  info:
    'bg-primary/15 border-primary/30 text-primary',
  neutral:
    'bg-muted/15 border-muted/30 text-muted-foreground',
  primary:
    'bg-primary/15 border-primary/30 text-primary',
};

/**
 * Reusable status badge pill with consistent styling.
 * Supports success/danger/warning/info/neutral/primary variants.
 */
export function StatusBadge({
  label,
  variant,
  onClick,
  className,
}: StatusBadgeProps) {
  const Component = onClick ? 'button' : 'span';

  return (
    <Component
      onClick={onClick}
      className={cn(
        'inline-flex min-h-7 items-center rounded-squircle border px-2.5 py-1 text-xs font-semibold whitespace-nowrap shrink-0 transition-all',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:opacity-80',
        className,
      )}
    >
      {label}
    </Component>
  );
}
