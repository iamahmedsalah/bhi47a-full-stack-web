'use client';

import React from 'react';
import { cn } from '@/lib/cn';

export interface FileTypeMeta {
  ext: string;
  label: string;
  accent: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  kind: 'pdf' | 'word' | 'excel' | 'csv' | 'powerpoint' | 'image' | 'archive' | 'video' | 'text' | 'generic';
}

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'application/csv': 'csv',
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/avif': 'avif',
  'text/plain': 'txt',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

export function getFileExtension(fileName?: string | null, mimeType?: string | null): string {
  if (fileName) {
    const trimmed = fileName.trim();
    const lastDot = trimmed.lastIndexOf('.');
    if (lastDot > 0 && lastDot < trimmed.length - 1) {
      return trimmed.slice(lastDot + 1).toLowerCase();
    }
  }
  if (mimeType) {
    const cleanMime = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    if (MIME_TO_EXT[cleanMime]) return MIME_TO_EXT[cleanMime];
    if (cleanMime.startsWith('image/')) return cleanMime.replace('image/', '');
    if (cleanMime.startsWith('video/')) return cleanMime.replace('video/', '');
  }
  return '';
}

export function getFileTypeMeta(fileName?: string | null, mimeType?: string | null): FileTypeMeta {
  const ext = getFileExtension(fileName, mimeType);
  const shortLabel = (ext || 'FILE').slice(0, 4).toUpperCase();

  if (ext === 'pdf') {
    return {
      ext,
      label: 'PDF',
      accent: '#EF4444',
      bgClass: 'bg-rose-500/12',
      borderClass: 'border-rose-500/25',
      textClass: 'text-rose-600 dark:text-rose-400',
      kind: 'pdf',
    };
  }
  if (ext === 'doc' || ext === 'docx' || ext === 'rtf' || ext === 'odt') {
    return {
      ext,
      label: ext === 'docx' ? 'DOCX' : 'DOC',
      accent: '#2563EB',
      bgClass: 'bg-blue-500/12',
      borderClass: 'border-blue-500/25',
      textClass: 'text-blue-600 dark:text-blue-400',
      kind: 'word',
    };
  }
  if (ext === 'xls' || ext === 'xlsx' || ext === 'ods') {
    return {
      ext,
      label: ext === 'xlsx' ? 'XLSX' : 'XLS',
      accent: '#16A34A',
      bgClass: 'bg-emerald-500/12',
      borderClass: 'border-emerald-500/25',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      kind: 'excel',
    };
  }
  if (ext === 'csv') {
    return {
      ext,
      label: 'CSV',
      accent: '#0D9488',
      bgClass: 'bg-teal-500/12',
      borderClass: 'border-teal-500/25',
      textClass: 'text-teal-600 dark:text-teal-400',
      kind: 'csv',
    };
  }
  if (ext === 'ppt' || ext === 'pptx' || ext === 'odp' || ext === 'key') {
    return {
      ext,
      label: ext === 'pptx' ? 'PPTX' : 'PPT',
      accent: '#EA580C',
      bgClass: 'bg-orange-500/12',
      borderClass: 'border-orange-500/25',
      textClass: 'text-orange-600 dark:text-orange-400',
      kind: 'powerpoint',
    };
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif', 'ico'].includes(ext)) {
    const isPng = ext === 'png';
    return {
      ext,
      label: ext === 'jpeg' ? 'JPG' : shortLabel,
      accent: isPng ? '#8B5CF6' : '#0EA5E9',
      bgClass: isPng ? 'bg-violet-500/12' : 'bg-sky-500/12',
      borderClass: isPng ? 'border-violet-500/25' : 'border-sky-500/25',
      textClass: isPng ? 'text-violet-600 dark:text-violet-400' : 'text-sky-600 dark:text-sky-400',
      kind: 'image',
    };
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return {
      ext,
      label: shortLabel,
      accent: '#D97706',
      bgClass: 'bg-amber-500/12',
      borderClass: 'border-amber-500/25',
      textClass: 'text-amber-600 dark:text-amber-400',
      kind: 'archive',
    };
  }
  if (['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) {
    return {
      ext,
      label: shortLabel,
      accent: '#6366F1',
      bgClass: 'bg-indigo-500/12',
      borderClass: 'border-indigo-500/25',
      textClass: 'text-indigo-600 dark:text-indigo-400',
      kind: 'video',
    };
  }
  if (['txt', 'md', 'json', 'xml'].includes(ext)) {
    return {
      ext,
      label: shortLabel,
      accent: '#64748B',
      bgClass: 'bg-slate-500/12',
      borderClass: 'border-slate-500/25',
      textClass: 'text-slate-600 dark:text-slate-300',
      kind: 'text',
    };
  }

  return {
    ext,
    label: shortLabel,
    accent: '#0D9488',
    bgClass: 'bg-primary/10',
    borderClass: 'border-primary/20',
    textClass: 'text-primary',
    kind: 'generic',
  };
}

interface FileTypeIconProps {
  fileName?: string | null;
  mimeType?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<FileTypeIconProps['size']>, string> = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

export function FileTypeIcon({
  fileName,
  mimeType,
  size = 'md',
  className,
}: FileTypeIconProps) {
  const meta = getFileTypeMeta(fileName, mimeType);
  const badgeFontSize = meta.label.length >= 4 ? 7.2 : 8.2;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        SIZE_CLASSES[size],
        className,
      )}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 40 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full drop-shadow-xs"
      >
        {/* Document body */}
        <path
          d="M8 3.5C8 2.11929 9.11929 1 10.5 1H25.2L35 10.8V38.5C35 39.8807 33.8807 41 32.5 41H10.5C9.11929 41 8 39.8807 8 38.5V3.5Z"
          fill={meta.accent}
          fillOpacity="0.14"
          stroke={meta.accent}
          strokeOpacity="0.55"
          strokeWidth="1.6"
        />
        {/* Folded corner */}
        <path
          d="M25 1.2V8.8C25 9.90457 25.8954 10.8 27 10.8H34.8L25 1.2Z"
          fill={meta.accent}
          fillOpacity="0.35"
        />

        {/* Kind-specific minimal vector glyph above the extension pill */}
        {meta.kind === 'image' && (
          <g stroke={meta.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="16.5" cy="14" r="2" fill={meta.accent} stroke="none" />
            <path d="M13 21L17.2 16.8L20.5 19.6L24 15.8L28.5 21H13Z" fill={meta.accent} fillOpacity="0.35" />
          </g>
        )}
        {(meta.kind === 'excel' || meta.kind === 'csv') && (
          <g stroke={meta.accent} strokeWidth="1.4" strokeLinecap="round">
            <rect x="13.5" y="12" width="15" height="9.5" rx="1.5" fill={meta.accent} fillOpacity="0.15" />
            <line x1="13.5" y1="15.5" x2="28.5" y2="15.5" />
            <line x1="18.8" y1="12" x2="18.8" y2="21.5" />
            <line x1="23.8" y1="12" x2="23.8" y2="21.5" />
          </g>
        )}
        {meta.kind === 'powerpoint' && (
          <g stroke={meta.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="13.5" y="12" width="15" height="9.5" rx="1.5" fill={meta.accent} fillOpacity="0.15" />
            <path d="M18.5 14.5H21.2C22.4 14.5 23.2 15.2 23.2 16.3C23.2 17.4 22.4 18.1 21.2 18.1H18.5V14.5Z" fill={meta.accent} fillOpacity="0.4" />
            <line x1="18.5" y1="18.1" x2="18.5" y2="19.8" />
          </g>
        )}
        {meta.kind === 'word' && (
          <g stroke={meta.accent} strokeWidth="1.7" strokeLinecap="round">
            <line x1="13.5" y1="13.5" x2="23" y2="13.5" />
            <line x1="13.5" y1="17" x2="28" y2="17" />
            <line x1="13.5" y1="20.5" x2="25.5" y2="20.5" />
          </g>
        )}
        {meta.kind === 'pdf' && (
          <g stroke={meta.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 20.5C17.2 16 19.5 12.2 20.8 12.2C22 12.2 20.5 17 24.5 18.5C27.5 19.6 28.2 17.5 26 17C22.5 16.3 15.5 18.2 14.2 19.8" />
          </g>
        )}
        {meta.kind === 'archive' && (
          <g fill={meta.accent}>
            <rect x="19" y="11" width="3" height="2.2" rx="0.5" />
            <rect x="21" y="13.8" width="3" height="2.2" rx="0.5" />
            <rect x="19" y="16.6" width="3" height="2.2" rx="0.5" />
            <rect x="19.2" y="19.5" width="4.6" height="2.6" rx="1" />
          </g>
        )}
        {meta.kind === 'video' && (
          <path
            d="M18 12.8L25.5 16.8L18 20.8V12.8Z"
            fill={meta.accent}
            fillOpacity="0.85"
          />
        )}
        {(meta.kind === 'text' || meta.kind === 'generic') && (
          <g stroke={meta.accent} strokeWidth="1.6" strokeLinecap="round">
            <line x1="13.5" y1="14" x2="23" y2="14" />
            <line x1="13.5" y1="17.5" x2="27.5" y2="17.5" />
            <line x1="13.5" y1="21" x2="22" y2="21" />
          </g>
        )}

        {/* Extension pill */}
        <rect
          x="3"
          y="24.5"
          width="30"
          height="13.5"
          rx="4"
          fill={meta.accent}
        />
        <text
          x="18"
          y="33.8"
          textAnchor="middle"
          fill="#FFFFFF"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
          fontWeight="800"
          fontSize={badgeFontSize}
          letterSpacing="0.03em"
        >
          {meta.label}
        </text>
      </svg>
    </span>
  );
}
