import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { _id?: string }>({
  rows,
  columns,
  getRowKey,
  rowClassName,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey?: (row: T, index: number) => string;
  rowClassName?: (row: T) => string | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-start">
        <thead>
          <tr className="border-b border-border bg-surface/50 text-sm font-medium text-muted">
            {columns.map((column) => (
              <th key={column.key} className={cn('p-4 text-start', column.className)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((row, index) => (
            <tr
              key={getRowKey ? getRowKey(row, index) : row._id || index}
              className={cn('text-sm text-foreground transition-colors hover:bg-surface/30', rowClassName?.(row))}
            >
              {columns.map((column) => (
                <td key={column.key} className={cn('p-4', column.className)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
