'use client';

import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/cn';

interface ConfirmDialogProps {
  dir?: 'rtl' | 'ltr';
  /** The trigger element (e.g. a delete button) */
  trigger?: React.ReactNode;
  /** Controlled open state */
  open?: boolean;
  /** Controlled open state handler */
  onOpenChange?: (open: boolean) => void;
  /** Dialog title */
  title: string;
  /** Dialog description / body */
  description: React.ReactNode;
  /** Confirm button text */
  confirmLabel: string;
  /** Cancel button text */
  cancelLabel: string;
  /** Whether the confirm action is destructive (red styling) */
  destructive?: boolean;
  /** Called when user confirms */
  onConfirm: () => void;
  /** Whether confirm button is disabled */
  disabled?: boolean;
}

/**
 * Reusable confirm dialog wrapping shadcn AlertDialog.
 * Supports AR/EN via passed labels. Used for all delete/deactivate operations.
 */
export function ConfirmDialog({
  dir,
  trigger,
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onConfirm,
  disabled,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent dir={dir} className="w-[95vw] max-w-md border-border bg-card p-5 sm:p-6 shadow-2xl rounded-2xl">
        <AlertDialogHeader className="space-y-2 text-start">
          <AlertDialogTitle className="text-lg font-bold text-foreground">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end rtl:sm:justify-start mt-5">
          <AlertDialogCancel className="w-full sm:w-auto rounded-squircle text-xs border-border hover:bg-secondary cursor-pointer">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={disabled}
            className={cn(
              'w-full sm:w-auto rounded-squircle text-xs font-semibold cursor-pointer shadow-sm',
              destructive
                ? 'bg-danger text-white hover:bg-danger/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
