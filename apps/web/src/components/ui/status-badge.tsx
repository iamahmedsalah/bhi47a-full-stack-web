'use client';

import React from 'react';
import { cn } from '@/lib/cn';

import { useLocale } from 'next-intl';

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
  let locale = 'ar';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    locale = useLocale();
  } catch {
    locale = 'ar';
  }

  const isEn = locale === 'en';

  const displayLabel = React.useMemo(() => {
    const raw = String(label).trim().toLowerCase();
    if (isEn) {
      switch (raw) {
        case 'present': return 'Present';
        case 'absent': return 'Absent';
        case 'banned': return 'Banned';
        case 'late': return 'Late';
        case 'active': return 'Active';
        case 'inactive': return 'Inactive';
        case 'completed': return 'Completed';
        case 'pending': return 'Pending';
        case 'approved': return 'Approved';
        case 'rejected': return 'Rejected';
        case 'published': return 'Published';
        case 'hidden': return 'Hidden';
        case 'pass': return 'Pass';
        case 'fail': return 'Fail';
        default: return label;
      }
    }

    switch (raw) {
      case 'present':
        return 'حاضر';
      case 'absent':
        return 'غائب';
      case 'banned':
        return 'محروم';
      case 'late':
        return 'متأخر';
      case 'active':
        return 'نشط';
      case 'inactive':
        return 'غير نشط';
      case 'completed':
        return 'مكتمل';
      case 'pending':
        return 'قيد الانتظار';
      case 'approved':
        return 'معتمد';
      case 'rejected':
        return 'مرفوض';
      case 'published':
        return 'منشور';
      case 'hidden':
        return 'مخفي';
      case 'pass':
        return 'ناجح';
      case 'fail':
        return 'راسب';
      default:
        return label;
    }
  }, [label, isEn]);

  return (
    <Component
      onClick={onClick}
      className={cn(
        'inline-flex h-6 min-h-[1.5rem] w-fit items-center justify-center rounded-squircle border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap shrink-0 transition-all leading-none',
        variantStyles[variant],
        onClick && 'cursor-pointer hover:opacity-80',
        className,
      )}
    >
      {displayLabel}
    </Component>
  );
}
