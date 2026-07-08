'use client';

import React from 'react';
import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { getApiErrorDetails } from '@/lib/api';
import { cn } from '@/lib/cn';
import { GlassCard } from '@/components/ui/glass-card';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface LoadingPlaceholderProps {
  message?: string;
}

export function TableLoading({ message }: LoadingPlaceholderProps) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-3 p-8 text-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

interface EmptyPlaceholderProps {
  message?: string;
  icon?: React.ReactNode;
}

export function TableEmpty({ message, icon }: EmptyPlaceholderProps) {
  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <div className="flex h-12 w-12 items-center justify-center rounded-squircle border border-border bg-surface/50 text-muted-foreground">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="max-w-sm text-sm">{message ?? 'No data found.'}</p>
    </div>
  );
}

interface ErrorPlaceholderProps {
  message?: string;
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
}

export function TableError({
  message,
  error,
  onRetry,
  retryLabel,
}: ErrorPlaceholderProps) {
  const details = error ? getApiErrorDetails(error, message) : null;
  const displayMsg = message ?? details?.message ?? 'Unable to load data.';
  const displayCode = details?.code;
  const displayReason = details?.reason;

  return (
    <div className="flex min-h-60 flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-squircle border border-danger/30 bg-danger/10 text-danger">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{displayMsg}</p>
        {(displayCode || displayReason) && (
          <div className="mt-2 rounded-squircle border border-danger/25 bg-danger/5 px-3 py-2 text-start font-mono text-xs text-danger">
            {displayCode && <p>Code: {displayCode}</p>}
            {displayReason && <p>Reason: {displayReason}</p>}
          </div>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-squircle border border-danger/30 px-4 py-2 text-xs font-semibold text-danger transition-all hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/50 cursor-pointer"
        >
          {retryLabel ?? 'Retry'}
        </button>
      )}
    </div>
  );
}

export interface ColumnDef<T> {
  key: string;
  header: string;
  className?: string;
  render: (item: T, index: number) => React.ReactNode;
}

interface DataTableShellProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  errorMessage?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
  enableSelection?: boolean;
  selectedKeys?: string[];
  onSelectedKeysChange?: (keys: string[]) => void;
  bulkActions?: {
    label: string;
    onClick: (keys: string[]) => void | Promise<void>;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary';
    icon?: React.ReactNode;
  }[];
}

export function DataTableShell<T>({
  columns,
  data,
  keyExtractor,
  isLoading,
  isError,
  error,
  errorMessage,
  emptyMessage,
  loadingMessage,
  onRetry,
  retryLabel,
  className,
  enableSelection = false,
  selectedKeys = [],
  onSelectedKeysChange,
  bulkActions = [],
}: DataTableShellProps<T>) {
  const allKeys = data.map(keyExtractor);
  const isAllSelected = data.length > 0 && selectedKeys.length === data.length;
  const isSomeSelected = selectedKeys.length > 0 && selectedKeys.length < data.length;

  const toggleAll = () => {
    if (!onSelectedKeysChange) return;
    onSelectedKeysChange(isAllSelected ? [] : allKeys);
  };

  const toggleOne = (key: string) => {
    if (!onSelectedKeysChange) return;
    onSelectedKeysChange(
      selectedKeys.includes(key)
        ? selectedKeys.filter((selectedKey) => selectedKey !== key)
        : [...selectedKeys, key],
    );
  };

  return (
    <GlassCard className={cn('p-0', className)}>
      {enableSelection && selectedKeys.length > 0 && bulkActions.length > 0 && (
        <div className="flex flex-col gap-2 border-b border-border/70 bg-primary/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs font-semibold text-foreground">
            {selectedKeys.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => action.onClick(selectedKeys)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-squircle border px-3 py-1.5 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 cursor-pointer',
                  action.variant === 'destructive'
                    ? 'border-danger/30 bg-danger/15 text-danger hover:bg-danger/25'
                    : action.variant === 'secondary'
                      ? 'border-border bg-secondary/60 text-secondary-foreground hover:bg-secondary/80'
                      : 'border-primary/30 bg-primary/90 text-primary-foreground hover:bg-primary-hover',
                )}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <TableLoading message={loadingMessage} />
      ) : isError ? (
        <TableError
          message={errorMessage}
          error={error}
          onRetry={onRetry}
          retryLabel={retryLabel}
        />
      ) : data.length === 0 ? (
        <TableEmpty message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-border/70 bg-surface/45">
              <TableRow className="hover:bg-transparent">
                {enableSelection && (
                  <TableHead className="w-12 px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={isAllSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = isSomeSelected;
                      }}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer appearance-none rounded-full border border-border bg-surface transition-all checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    />
                  </TableHead>
                )}
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className={cn('px-4 py-3 text-start text-xs font-semibold text-foreground', column.className)}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item, index) => {
                const key = keyExtractor(item);
                const isSelected = selectedKeys.includes(key);

                return (
                  <TableRow
                    key={key}
                    className={cn(
                      'border-b border-border/50 text-sm transition-colors hover:bg-surface/40',
                      isSelected && 'bg-primary/5 hover:bg-primary/10',
                    )}
                  >
                    {enableSelection && (
                      <td className="w-12 px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          aria-label="Select row"
                          checked={isSelected}
                          onChange={() => toggleOne(key)}
                          className="h-4 w-4 cursor-pointer appearance-none rounded-full border border-border bg-surface transition-all checked:border-primary checked:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <React.Fragment key={column.key}>
                        {column.render(item, index)}
                      </React.Fragment>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </GlassCard>
  );
}
