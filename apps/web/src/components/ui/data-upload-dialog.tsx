'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface UploadResult {
  success: boolean;
  successCount: number;
  failedCount: number;
  errors: string[];
}

interface DataUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  uploadType: string;
  expectedColumns: string[];
  onSuccess?: (result: UploadResult) => void;
}

export function DataUploadDialog({
  open,
  onOpenChange,
  title,
  description,
  uploadType,
  expectedColumns,
  onSuccess,
}: DataUploadDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isUploading, setIsUploading] = React.useState(false);
  const [result, setResult] = React.useState<UploadResult | null>(null);
  const [error, setError] = React.useState('');

  const resetState = () => {
    setFile(null);
    setIsDragging(false);
    setIsUploading(false);
    setResult(null);
    setError('');
  };

  const selectFile = (nextFile?: File) => {
    if (!nextFile) return;
    const isAllowed = /\.(xlsx|xls|csv)$/i.test(nextFile.name);
    if (!isAllowed) {
      setError('Please choose an XLSX, XLS, or CSV file.');
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError('File must be 10 MB or smaller.');
      return;
    }
    setError('');
    setResult(null);
    setFile(nextFile);
  };

  const uploadFile = async () => {
    if (!file) return;
    setIsUploading(true);
    setError('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', uploadType);

    try {
      const res = await api.post<UploadResult>('/admin/uploads', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      onSuccess?.(res.data);
      toast.success(`Imported ${res.data.successCount} row(s) successfully`);
    } catch (uploadError) {
      setError(getApiErrorMessage(uploadError, 'Upload failed'));
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) resetState();
      }}
    >
      <DialogContent className="max-w-2xl rounded-xl border border-border/70 bg-card/95 text-foreground shadow-(--shadow-glow) backdrop-blur">
        <DialogHeader className="border-b border-border/70 pb-4 text-start">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
          <label
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              selectFile(event.dataTransfer.files[0]);
            }}
            className={cn(
              'flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/35 p-6 text-center transition-all hover:border-primary/60 hover:bg-primary/5',
              isDragging && 'border-primary bg-primary/10',
              file && 'border-success/50 bg-success/5',
            )}
          >
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            {file ? (
              <>
                <FileSpreadsheet className="h-10 w-10 text-success" />
                <p className="mt-3 max-w-full truncate text-sm font-bold text-foreground">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </>
            ) : (
              <>
                <UploadCloud className="h-10 w-10 text-primary" />
                <p className="mt-3 text-sm font-bold text-foreground">Drop file here or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">Supported: .xlsx, .xls, .csv up to 10 MB</p>
              </>
            )}
          </label>

          <div className="rounded-xl border border-border/70 bg-surface/30 p-4">
            <h3 className="text-sm font-bold text-foreground">Required columns</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Headers can be English or Arabic where the backend supports both.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {expectedColumns.map((column) => (
                <span
                  key={column}
                  className="rounded-squircle border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  {column}
                </span>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result && (
          <div className="rounded-xl border border-border/70 bg-surface/35 p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Upload complete
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.successCount} imported, {result.failedCount} failed.
            </p>
            {result.errors.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-squircle border border-danger/20 bg-danger/5 p-3 text-xs text-danger">
                {result.errors.map((item, index) => (
                  <p key={`${item}-${index}`}>{item}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="border-t border-border/70 pt-4">
          <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" disabled={!file || isUploading} onClick={uploadFile}>
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Import Data
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
