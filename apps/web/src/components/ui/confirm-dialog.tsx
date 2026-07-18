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
      <AlertDialogContent className="w-[95vw] max-w-md border-border bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-start text-foreground">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-start text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <AlertDialogCancel className="w-full border-border sm:w-auto">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={disabled}
            className={cn(
              'w-full font-semibold sm:w-auto',
              destructive
                ? 'bg-danger text-white hover:bg-danger/90'
                : 'bg-primary text-white hover:bg-primary/90',
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
