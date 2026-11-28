'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Loader2,
  Maximize2,
  Minimize2,
  Presentation,
  RotateCw,
  Search,
  User,
  Video,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import api, { getApiErrorDetails, getApiErrorMessage } from '@/lib/api';
import { downloadFileBlob } from '@/lib/export-utils';
import {
  formatStaffDisplayName,
  type CourseMaterialDto,
  type CourseMaterialPreviewResponse,
  type MaterialPreviewDocBlock,
  type MaterialPreviewParagraph,
  type MaterialPreviewSlide,
  type MaterialPreviewTextRun,
} from '@student-portal/shared';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileTypeIcon, getFileTypeMeta } from '@/components/ui/file-type-icon';

interface CourseMaterialPreviewDialogProps {
  material: CourseMaterialDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseCode: string;
  locale: string;
}

interface ResolvedVideoEmbed {
  mode: 'iframe' | 'video' | 'external';
  embedUrl: string;
  providerLabel: string;
}

function resolveVideoEmbed(rawUrl?: string): ResolvedVideoEmbed | null {
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.split('/').filter(Boolean)[0];
      if (id && /^[\w-]{6,20}$/.test(id)) {
        return {
          mode: 'iframe',
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
          providerLabel: 'YouTube',
        };
      }
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
      const vParam = parsed.searchParams.get('v');
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      const id =
        vParam ||
        (pathParts[0] === 'embed' || pathParts[0] === 'shorts' || pathParts[0] === 'live'
          ? pathParts[1]
          : undefined);
      if (id && /^[\w-]{6,20}$/.test(id)) {
        return {
          mode: 'iframe',
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
          providerLabel: 'YouTube',
        };
      }
    }

    if (host === 'drive.google.com') {
      const fileMatch = /\/file\/d\/([^/]+)/.exec(parsed.pathname);
      const openId = parsed.searchParams.get('id');
      const driveId = fileMatch?.[1] || openId;
      if (driveId && /^[\w-]{10,}$/.test(driveId)) {
        return {
          mode: 'iframe',
          embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
          providerLabel: 'Google Drive',
        };
      }
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const segments = parsed.pathname.split('/').filter(Boolean);
      const numericId = segments.find((seg) => /^\d+$/.test(seg));
      if (numericId) {
        return {
          mode: 'iframe',
          embedUrl: `https://player.vimeo.com/video/${numericId}`,
          providerLabel: 'Vimeo',
        };
      }
    }

    if (/\.(mp4|webm|ogg)$/i.test(parsed.pathname)) {
      return {
        mode: 'video',
        embedUrl: parsed.toString(),
        providerLabel: 'Video',
      };
    }

    return {
      mode: 'external',
      embedUrl: parsed.toString(),
      providerLabel: parsed.hostname,
    };
  } catch {
    return null;
  }
}

async function extractPreviewBlob(raw: unknown, mimeType: string): Promise<Blob> {
  const rawRecord =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;

  let sourceBlob: Blob;
  if (raw instanceof Blob) {
    sourceBlob = raw;
  } else if (rawRecord && rawRecord.data instanceof Blob) {
    sourceBlob = rawRecord.data;
  } else if (rawRecord && rawRecord.data !== undefined) {
    sourceBlob = new Blob([rawRecord.data as BlobPart], { type: mimeType });
  } else {
    sourceBlob = new Blob([raw as BlobPart], { type: mimeType });
  }

  if (sourceBlob.type.includes('application/json')) {
    const errorText = await sourceBlob.text();
    try {
      const errObj = JSON.parse(errorText) as Record<string, unknown>;
      const msg = typeof errObj.message === 'string' ? errObj.message : '';
      throw new Error(msg || 'Failed to load preview');
    } catch (err) {
      if (err instanceof Error && err.message !== 'Failed to load preview') throw err;
      throw new Error(errorText || 'Failed to load preview');
    }
  }

  if (sourceBlob.size === 0) {
    throw new Error('Preview file is empty');
  }

  return new Blob([sourceBlob], {
    type: mimeType || sourceBlob.type || 'application/octet-stream',
  });
}

/**
 * React 19 StrictMode-safe Object URL hook: creates and revokes the Blob URL
 * inside a single effect lifecycle so simulated dev remounts never leave a dead URL.
 */
function useStrictSafeObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob || typeof window === 'undefined') {
      queueMicrotask(() => setUrl(null));
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    let active = true;
    queueMicrotask(() => {
      if (active) setUrl(objectUrl);
    });
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  return url;
}

function isDarkHex(hex?: string): boolean {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return false;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.45;
}

function ensureContrastColor(color: string | undefined, onDarkSurface: boolean): string | undefined {
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color)) return undefined;
  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (!onDarkSurface && luminance > 0.88) return '#0F172A';
  if (onDarkSurface && luminance < 0.15) return '#F8FAFC';
  return color;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StyledRuns({
  runs,
  onDarkSurface = false,
}: {
  runs: MaterialPreviewTextRun[];
  onDarkSurface?: boolean;
}) {
  return (
    <>
      {runs.map((run, idx) => {
        if (run.text === '\n') return <br key={idx} />;
        const safeColor = ensureContrastColor(run.color, onDarkSurface);
        return (
          <span
            key={idx}
            className={[
              run.bold ? 'font-bold' : '',
              run.italic ? 'italic' : '',
              run.underline ? 'underline underline-offset-2' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={safeColor ? { color: safeColor } : undefined}
          >
            {run.text}
          </span>
        );
      })}
    </>
  );
}

function ParagraphBlock({
  paragraph,
  compact = false,
  onDarkSurface = false,
}: {
  paragraph: MaterialPreviewParagraph;
  compact?: boolean;
  onDarkSurface?: boolean;
}) {
  const alignClass =
    paragraph.align === 'center'
      ? 'text-center'
      : paragraph.align === 'justify'
        ? 'text-justify'
        : paragraph.align === 'right'
          ? 'text-right'
          : paragraph.align === 'left'
            ? 'text-left'
            : paragraph.dir === 'rtl'
              ? 'text-right'
              : 'text-left';

  const indentRem = paragraph.bulletLevel ? Math.min(paragraph.bulletLevel, 4) * 1.1 : 0;

  return (
    <p
      dir={paragraph.dir || 'auto'}
      className={[
        alignClass,
        'whitespace-pre-wrap break-words leading-relaxed',
        paragraph.isTitle
          ? compact
            ? 'text-sm sm:text-base font-extrabold tracking-tight'
            : 'text-base sm:text-xl font-extrabold tracking-tight'
          : compact
            ? 'text-xs sm:text-sm'
            : 'text-sm',
      ].join(' ')}
      style={indentRem ? { paddingInlineStart: `${indentRem}rem` } : undefined}
    >
      {paragraph.bulletLevel !== undefined && !paragraph.isTitle && (
        <span className="inline-block me-1.5 text-primary font-bold select-none">•</span>
      )}
      <StyledRuns runs={paragraph.runs} onDarkSurface={onDarkSurface} />
    </p>
  );
}

function SlideStage({
  slide,
  aspectRatio,
  viewMode,
  isAr,
}: {
  slide: MaterialPreviewSlide;
  aspectRatio: number;
  viewMode: 'visual' | 'outline';
  isAr: boolean;
}) {
  if (viewMode === 'outline') {
    const images = slide.elements.filter((el) => el.kind === 'image');
    const tables = slide.elements.filter((el) => el.kind === 'table');

    return (
      <div className="rounded-xl border border-border/70 bg-card/90 p-4 sm:p-6 space-y-4">
        {slide.title && (
          <h4
            dir="auto"
            className="text-base sm:text-lg font-bold text-foreground border-b border-border/60 pb-2.5"
          >
            {slide.title}
          </h4>
        )}

        {slide.outline.length > 0 ? (
          <div className="space-y-2.5 text-foreground">
            {slide.outline.map((para, idx) => (
              <ParagraphBlock key={idx} paragraph={para} />
            ))}
          </div>
        ) : (
          images.length === 0 &&
          tables.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-6">
              {isAr ? 'لا يوجد نص مستخرج في هذه الشريحة' : 'No extractable text on this slide'}
            </p>
          )
        )}

        {tables.map((tbl, tIdx) => (
          <div key={tIdx} className="overflow-x-auto rounded-lg border border-border/70">
            <table className="w-full text-xs border-collapse">
              <tbody>
                {tbl.rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className={
                      rIdx === 0 ? 'bg-secondary/60 font-bold' : 'border-t border-border/50'
                    }
                  >
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} dir="auto" className="px-3 py-2 border-e border-border/40">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {images.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {images.map((img, iIdx) => (
              <div
                key={iIdx}
                className="rounded-lg border border-border/60 bg-background/60 p-2 flex items-center justify-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={img.alt || `Slide ${slide.index} figure ${iIdx + 1}`}
                  className="max-h-64 w-auto object-contain rounded"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const resolvedBg = slide.backgroundColor || '#FFFFFF';
  const slideIsDark = isDarkHex(resolvedBg);

  return (
    <div
      dir="ltr"
      className="relative w-full mx-auto rounded-xl border border-border/80 shadow-md overflow-hidden select-text"
      style={{
        aspectRatio: `${aspectRatio || 16 / 9}`,
        backgroundColor: resolvedBg,
        color: slideIsDark ? '#F8FAFC' : '#0F172A',
      }}
    >
      {slide.elements.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center p-4 text-center text-xs text-slate-400">
          {isAr ? 'شريحة فارغة' : 'Empty slide'}
        </div>
      ) : (
        slide.elements.map((el, idx) => {
          if (el.kind === 'image') {
            return (
              <div
                key={idx}
                className="absolute flex items-center justify-center overflow-hidden pointer-events-none"
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.w}%`,
                  height: `${el.h}%`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={el.dataUrl}
                  alt={el.alt || ''}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            );
          }

          if (el.kind === 'table') {
            return (
              <div
                key={idx}
                className="absolute overflow-auto rounded border border-slate-300 bg-white/95 shadow-2xs"
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.w}%`,
                  maxHeight: `${el.h}%`,
                }}
              >
                <table className="w-full text-[11px] sm:text-xs border-collapse text-slate-900">
                  <tbody>
                    {el.rows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className={
                          rIdx === 0
                            ? 'bg-teal-600 text-white font-bold'
                            : 'border-t border-slate-200 even:bg-slate-50'
                        }
                      >
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            dir="auto"
                            className="px-2 py-1 border-e border-slate-200/70 align-top"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          const boxIsDark = el.fillColor ? isDarkHex(el.fillColor) : slideIsDark;
          return (
            <div
              key={idx}
              className={[
                'absolute overflow-y-auto px-1.5 py-1 space-y-1',
                el.fillColor ? 'rounded-md shadow-2xs' : '',
              ].join(' ')}
              style={{
                left: `${el.x}%`,
                top: `${el.y}%`,
                width: `${el.w}%`,
                maxHeight: `${Math.max(el.h, 14)}%`,
                ...(el.fillColor
                  ? {
                      backgroundColor: el.fillColor,
                      color: boxIsDark ? '#F8FAFC' : '#0F172A',
                    }
                  : {}),
              }}
            >
              {el.paragraphs.map((para, pIdx) => (
                <ParagraphBlock
                  key={pIdx}
                  paragraph={para}
                  compact
                  onDarkSurface={boxIsDark}
                />
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}

function WordDocumentView({
  blocks,
  truncated,
  isAr,
}: {
  blocks: MaterialPreviewDocBlock[];
  truncated?: boolean;
  isAr: boolean;
}) {
  if (blocks.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-secondary/20 p-8 text-center text-xs text-muted-foreground">
        {isAr
          ? 'لا يوجد محتوى نصي قابل للعرض في هذا المستند.'
          : 'No readable content found in this document.'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-border/70 bg-card p-5 sm:p-8 shadow-xs space-y-3 text-foreground">
      {blocks.map((block, idx) => {
        if (block.kind === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-lg sm:text-xl font-extrabold text-foreground pt-2 border-b border-border/50 pb-1.5'
              : block.level === 2
                ? 'text-base sm:text-lg font-bold text-foreground pt-2'
                : 'text-sm sm:text-base font-bold text-foreground pt-1';
          return (
            <div key={idx} className={sizeClass}>
              <ParagraphBlock paragraph={block.paragraph} />
            </div>
          );
        }

        if (block.kind === 'list-item') {
          return (
            <div key={idx} className="ps-2">
              <ParagraphBlock
                paragraph={{
                  ...block.paragraph,
                  bulletLevel: block.paragraph.bulletLevel ?? 0,
                }}
              />
            </div>
          );
        }

        if (block.kind === 'table') {
          return (
            <div key={idx} className="my-3 overflow-x-auto rounded-xl border border-border/70">
              <table dir={block.dir || 'auto'} className="w-full text-xs border-collapse">
                <tbody>
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className={
                        rIdx === 0
                          ? 'bg-secondary/60 font-bold text-foreground'
                          : 'border-t border-border/50 even:bg-secondary/15'
                      }
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          dir="auto"
                          className="px-3 py-2 border-e border-border/40 whitespace-pre-wrap align-top"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.kind === 'image') {
          return (
            <div key={idx} className="my-3 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.dataUrl}
                alt={block.alt || ''}
                className="max-h-80 w-auto rounded-lg border border-border/60 object-contain"
              />
            </div>
          );
        }

        return <ParagraphBlock key={idx} paragraph={block.paragraph} />;
      })}

      {truncated && (
        <p className="pt-3 border-t border-border/60 text-center text-xs text-muted-foreground">
          {isAr
            ? 'تم عرض الجزء الأول من المستند للمعاينة السريعة. حمّل الملف للاطلاع على كامل الصفحات.'
            : 'Showing the first section for quick preview. Download the file to view the complete document.'}
        </p>
      )}
    </div>
  );
}

function PreviewViewport({
  material,
  courseCode,
  locale,
  isAr,
  onClose,
}: {
  material: CourseMaterialDto;
  courseCode: string;
  locale: string;
  isAr: boolean;
  onClose: () => void;
}) {
  const hasFile =
    material.hasFile ?? Boolean(material.mimeType || material.fileSize || !material.videoUrl);
  const isRootFileMissing = hasFile && material.fileAvailable === false;

  const [selectedEntry, setSelectedEntry] = useState<string | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'file' | 'video'>(
    hasFile && (!isRootFileMissing || !material.videoUrl) ? 'file' : 'video',
  );
  const [slideIdx, setSlideIdx] = useState(0);
  const [slideViewMode, setSlideViewMode] = useState<'visual' | 'outline'>('visual');
  const [sheetIdx, setSheetIdx] = useState(0);
  const [sheetSearch, setSheetSearch] = useState('');
  const [imageZoom, setImageZoom] = useState(1);
  const [imageRotation, setImageRotation] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const previewQuery = useQuery<CourseMaterialPreviewResponse>({
    queryKey: ['course-material-preview', material._id, material.updatedAt, selectedEntry ?? null],
    queryFn: async () => {
      const res = await api.get<CourseMaterialPreviewResponse>(
        `/courses/materials/${material._id}/preview`,
        {
          params: selectedEntry ? { entry: selectedEntry } : undefined,
        },
      );
      const unwrapped = res as unknown;
      if (
        unwrapped &&
        typeof unwrapped === 'object' &&
        'kind' in (unwrapped as Record<string, unknown>)
      ) {
        return unwrapped as CourseMaterialPreviewResponse;
      }
      return res.data;
    },
    enabled: activeTab === 'file' && hasFile && !isRootFileMissing,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const preview = previewQuery.data;
  const needsBinaryStream =
    activeTab === 'file' &&
    !isRootFileMissing &&
    Boolean(preview && (preview.kind === 'pdf' || preview.kind === 'image'));

  const binaryQuery = useQuery<Blob>({
    queryKey: [
      'course-material-binary-preview',
      material._id,
      material.updatedAt,
      selectedEntry ?? null,
      preview?.mimeType ?? '',
    ],
    queryFn: async () => {
      const raw = await api.get(`/courses/materials/${material._id}/download`, {
        params: {
          inline: '1',
          ...(selectedEntry ? { entry: selectedEntry } : {}),
        },
        responseType: 'blob',
      });
      return extractPreviewBlob(raw, preview?.mimeType || 'application/pdf');
    },
    enabled: needsBinaryStream,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const blobUrl = useStrictSafeObjectUrl(binaryQuery.data);

  const slides = preview?.slides ?? [];
  const safeSlideIdx = slides.length > 0 ? Math.min(slideIdx, slides.length - 1) : 0;
  const currentSlide = slides[safeSlideIdx];

  useEffect(() => {
    if (preview?.kind !== 'pptx' || slides.length <= 1 || activeTab !== 'file') return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setSlideIdx((prev) =>
          isAr ? Math.max(0, prev - 1) : Math.min(slides.length - 1, prev + 1),
        );
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setSlideIdx((prev) =>
          isAr ? Math.min(slides.length - 1, prev + 1) : Math.max(0, prev - 1),
        );
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview?.kind, slides.length, activeTab, isAr]);

  const sheets = preview?.sheets ?? [];
  const safeSheetIdx = sheets.length > 0 ? Math.min(sheetIdx, sheets.length - 1) : 0;
  const currentSheet = sheets[safeSheetIdx];

  const filteredSheetRows = useMemo(() => {
    if (!currentSheet) return [];
    const term = sheetSearch.trim().toLowerCase();
    const dataRows = currentSheet.rows.slice(1);
    if (!term) return dataRows;
    return dataRows.filter((row) => row.some((cell) => cell.toLowerCase().includes(term)));
  }, [currentSheet, sheetSearch]);

  const videoEmbed = useMemo(() => resolveVideoEmbed(material.videoUrl), [material.videoUrl]);

  const activeError = previewQuery.error || binaryQuery.error;
  const errorDetails = activeError ? getApiErrorDetails(activeError) : null;
  const isNotFound = errorDetails?.statusCode === 404;
  const isMissingFileError =
    isRootFileMissing ||
    (isNotFound &&
      (errorDetails.message === 'Material file is missing. Contact the administrator.' ||
        errorDetails.message === 'Material file is unavailable'));

  const handleDownloadTarget = async (entryOverride?: string, nameOverride?: string) => {
    setIsDownloading(true);
    try {
      const targetEntry = entryOverride ?? selectedEntry;
      const res = await api.get(`/courses/materials/${material._id}/download`, {
        params: targetEntry ? { entry: targetEntry } : undefined,
        responseType: 'blob',
      });
      const fallbackName =
        nameOverride ||
        (targetEntry ? targetEntry.split('/').pop() : undefined) ||
        preview?.fileName ||
        material.fileName ||
        `${material.title}.pdf`;
      await downloadFileBlob(
        res,
        fallbackName,
        preview?.mimeType || material.mimeType || 'application/octet-stream',
      );
    } catch (err) {
      toast.error(getApiErrorMessage(err, isAr ? 'فشل تحميل الملف' : 'Failed to download file'));
    } finally {
      setIsDownloading(false);
    }
  };

  const openEntryPreview = (entryName: string) => {
    setSlideIdx(0);
    setSheetIdx(0);
    setSheetSearch('');
    setImageZoom(1);
    setImageRotation(0);
    setSelectedEntry(entryName);
  };

  const localizedTitle = isAr ? material.titleAr || material.title : material.title;
  const localizedUploader = formatStaffDisplayName(
    {
      name: material.uploadedByName,
      nameAr: material.uploadedByNameAr,
      staffType: material.uploadedByRole === 'admin' ? undefined : material.uploadedByRole,
      role: material.uploadedByRole === 'admin' ? 'admin' : 'staff',
      titlePrefix: material.uploadedByTitlePrefix,
    },
    locale,
  );

  const activeFileName =
    selectedEntry?.split('/').pop() ||
    preview?.fileName ||
    (material.attachments && material.attachments.length > 1
      ? `${localizedTitle}.zip`
      : material.attachments?.[0]?.name || material.fileName || localizedTitle);

  const activeMimeType =
    preview?.mimeType ||
    (!selectedEntry && (material.attachments?.length ?? 0) > 1
      ? 'application/zip'
      : material.mimeType);

  return (
    <DialogContent
      flush
      dir={isAr ? 'rtl' : 'ltr'}
      className={
        isExpanded
          ? 'max-w-[96vw] sm:max-w-[96vw] h-[94vh] max-h-[94vh]'
          : 'max-w-4xl h-[86vh] max-h-[90vh]'
      }
    >
      <DialogHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {activeTab === 'video' && !hasFile ? (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-squircle border border-primary/30 bg-primary/15 text-primary">
                <Video className="size-5" />
              </span>
            ) : (
              <FileTypeIcon fileName={activeFileName} mimeType={activeMimeType} size="lg" />
            )}
            <div className="min-w-0 space-y-1 text-start">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-squircle border border-primary/25 bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-bold text-primary">
                  <bdi dir="ltr">{courseCode}</bdi>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-squircle text-[10px] font-bold ${
                    material.type === 'lecture'
                      ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
                      : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {material.type === 'lecture'
                    ? isAr
                      ? 'محاضرة'
                      : 'Lecture'
                    : isAr
                      ? 'سكشن'
                      : 'Section'}
                </span>
                {material.weekNumber ? (
                  <span className="px-2 py-0.5 rounded-squircle bg-secondary/70 text-[10px] font-semibold text-muted-foreground">
                    {isAr ? `الأسبوع ${material.weekNumber}` : `Week ${material.weekNumber}`}
                  </span>
                ) : null}
              </div>
              <DialogTitle className="text-sm sm:text-base font-bold text-foreground leading-snug break-words">
                <bdi>{localizedTitle}</bdi>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
                {localizedUploader ? (
                  <>
                    <span className="inline-flex items-center gap-1 font-medium text-foreground/85">
                      <User className="size-3" />
                      <bdi>{localizedUploader}</bdi>
                    </span>
                    <span>·</span>
                  </>
                ) : null}
                <bdi>{activeFileName}</bdi>
                {(preview?.fileSize ?? material.fileSize) ? (
                  <>
                    <span>·</span>
                    <bdi dir="ltr">{formatSize(preview?.fileSize ?? material.fileSize)}</bdi>
                  </>
                ) : null}
              </DialogDescription>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded((v) => !v)}
            className="hidden sm:inline-flex h-8 w-8 p-0 rounded-squircle text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
            title={
              isExpanded
                ? isAr
                  ? 'تصغير النافذة'
                  : 'Restore size'
                : isAr
                  ? 'تكبير النافذة'
                  : 'Maximize'
            }
            aria-label={
              isExpanded
                ? isAr
                  ? 'تصغير النافذة'
                  : 'Restore size'
                : isAr
                  ? 'تكبير النافذة'
                  : 'Maximize'
            }
          >
            {isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </Button>
        </div>

        {(hasFile && Boolean(material.videoUrl)) || selectedEntry ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {selectedEntry ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedEntry(undefined)}
                className="h-8 rounded-squircle text-xs font-semibold gap-1.5 cursor-pointer"
              >
                {isAr ? <ArrowRight className="size-3.5" /> : <ArrowLeft className="size-3.5" />}
                <span>{isAr ? 'العودة إلى قائمة المرفقات' : 'Back to bundle files'}</span>
              </Button>
            ) : (
              <div />
            )}

            {hasFile && Boolean(material.videoUrl) && (
              <div className="inline-flex items-center gap-1 rounded-xl border border-border/60 bg-secondary/40 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('file')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-squircle font-semibold transition-all cursor-pointer ${
                    activeTab === 'file'
                      ? 'bg-card text-primary shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Eye className="size-3.5" />
                  <span>{isAr ? 'معاينة الملف' : 'File Preview'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('video')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-squircle font-semibold transition-all cursor-pointer ${
                    activeTab === 'video'
                      ? 'bg-card text-primary shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Video className="size-3.5" />
                  <span>{isAr ? 'مشاهدة التسجيل' : 'Watch Recording'}</span>
                </button>
              </div>
            )}
          </div>
        ) : null}
      </DialogHeader>

      <DialogBody className="bg-background/40 p-3 sm:p-5 space-y-4">
        {activeTab === 'video' && material.videoUrl ? (
          <div className="space-y-3">
            {videoEmbed?.mode === 'iframe' ? (
              <div className="overflow-hidden rounded-xl border border-border/80 bg-black shadow-md aspect-video w-full">
                <iframe
                  src={videoEmbed.embedUrl}
                  title={localizedTitle}
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              </div>
            ) : videoEmbed?.mode === 'video' ? (
              <div className="overflow-hidden rounded-xl border border-border/80 bg-black shadow-md">
                <video
                  src={videoEmbed.embedUrl}
                  controls
                  preload="metadata"
                  className="w-full max-h-[65vh]"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-8 text-center space-y-3">
                <div className="mx-auto flex size-12 items-center justify-center rounded-squircle border border-primary/25 bg-primary/10 text-primary">
                  <Video className="size-6" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  {isAr ? 'تسجيل خارجي للمحاضرة أو السكشن' : 'External Class Recording'}
                </p>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  {isAr
                    ? 'اضغط على الزر أدناه لفتح ومشاهدة التسجيل مباشرة على المنصة المستضيفة.'
                    : 'Click below to open and watch the recording directly on its hosting platform.'}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-card/85 px-3.5 py-2.5 text-xs">
              <span className="text-muted-foreground truncate">
                {isAr
                  ? 'إذا لم يظهر المشغل المدمج بسبب صلاحيات المنصة الخارجية، افتح التسجيل في تبويب جديد:'
                  : 'If external permissions restrict embedding, open the recording in a new tab:'}
              </span>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-8 rounded-squircle shrink-0 gap-1.5"
              >
                <a
                  href={material.videoUrl.startsWith('https://') ? material.videoUrl : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-3.5 text-primary" />
                  <span>{isAr ? 'فتح في تبويب جديد' : 'Open in new tab'}</span>
                </a>
              </Button>
            </div>
          </div>
        ) : isMissingFileError ? (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/35 bg-amber-500/[0.08] p-8 text-center space-y-3"
          >
            <div className="mx-auto flex size-11 items-center justify-center rounded-squircle border border-amber-500/30 bg-amber-500/15 text-amber-500">
              <AlertTriangle className="size-5" />
            </div>
            <p className="text-sm font-bold text-foreground">
              {isAr
                ? 'الملف المادي غير متوفر على الخادم الحالي'
                : 'File Not Found on Current Server'}
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              {activeError
                ? getApiErrorMessage(activeError)
                : isAr
                  ? 'سجل هذا المرفق موجود في قاعدة البيانات، لكن الملف المادي غير محفوظ في وحدة التخزين الحالية (ربما تم رفعه على خادم آخر). يرجى إعادة رفع الملف عبر زر التعديل.'
                  : 'This material record exists in the database, but its file bytes are missing from local storage (it may have been uploaded on another server). Please re-upload the file via Edit.'}
            </p>
            {material.videoUrl ? (
              <div className="pt-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setActiveTab('video')}
                  className="rounded-squircle bg-primary text-white hover:bg-primary-hover text-xs gap-1.5 cursor-pointer"
                >
                  <Video className="size-3.5" />
                  <span>{isAr ? 'مشاهدة تسجيل الفيديو المرفق' : 'Watch Attached Video'}</span>
                </Button>
              </div>
            ) : null}
          </div>
        ) : previewQuery.isLoading ||
          (needsBinaryStream && (binaryQuery.isLoading || (binaryQuery.isSuccess && !blobUrl))) ? (
          <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-xs font-semibold">
              {isAr ? 'جاري تجهيز المعاينة...' : 'Preparing preview...'}
            </p>
          </div>
        ) : previewQuery.isError || (needsBinaryStream && binaryQuery.isError) ? (
          <div
            role="alert"
            className="rounded-xl border border-border/60 bg-secondary/20 p-8 text-center space-y-3"
          >
            <p className="text-sm font-semibold text-foreground">
              {isNotFound
                ? isAr
                  ? 'المعاينة غير متاحة حالياً. يمكنك تجربة تحميل الملف مباشرة.'
                  : 'Preview is currently unavailable. You can try downloading the file directly.'
                : getApiErrorMessage(
                    activeError,
                    isAr ? 'تعذّر تحضير معاينة هذا الملف' : 'Could not prepare file preview',
                  )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (previewQuery.isError) void previewQuery.refetch();
                  if (binaryQuery.isError) void binaryQuery.refetch();
                }}
                className="rounded-squircle text-xs cursor-pointer"
              >
                {isAr ? 'إعادة المحاولة' : 'Retry'}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void handleDownloadTarget()}
                disabled={isDownloading}
                className="rounded-squircle bg-primary text-white hover:bg-primary-hover text-xs gap-1.5 cursor-pointer"
              >
                <Download className="size-3.5" />
                <span>{isAr ? 'تحميل الملف مباشرة' : 'Download file instead'}</span>
              </Button>
            </div>
          </div>
        ) : preview?.kind === 'pdf' ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/20 px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-semibold text-foreground">
                <FileText className="size-4 text-rose-500" />
                <span>{isAr ? 'عارض مستندات PDF' : 'PDF Document Viewer'}</span>
              </span>
              {blobUrl && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-squircle text-xs gap-1.5"
                >
                  <a href={blobUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5 text-primary" />
                    <span>{isAr ? 'فتح في تبويب مستقل' : 'Open in new tab'}</span>
                  </a>
                </Button>
              )}
            </div>
            {blobUrl && (
              <iframe
                src={blobUrl}
                title={preview.fileName}
                className="w-full h-[60vh] rounded-xl border border-border/80 bg-white shadow-xs"
              />
            )}
          </div>
        ) : preview?.kind === 'image' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/20 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setImageZoom((z) => Math.max(0.5, Number((z - 0.25).toFixed(2))))}
                  className="h-7 w-7 p-0 rounded-squircle cursor-pointer"
                  aria-label={isAr ? 'تصغير' : 'Zoom out'}
                >
                  <ZoomOut className="size-3.5" />
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    setImageZoom(1);
                    setImageRotation(0);
                  }}
                  className="px-2 py-0.5 rounded-squircle text-xs font-mono font-bold text-foreground hover:bg-secondary/60 cursor-pointer"
                >
                  {Math.round(imageZoom * 100)}%
                </button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setImageZoom((z) => Math.min(3, Number((z + 0.25).toFixed(2))))}
                  className="h-7 w-7 p-0 rounded-squircle cursor-pointer"
                  aria-label={isAr ? 'تكبير' : 'Zoom in'}
                >
                  <ZoomIn className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setImageRotation((r) => (r + 90) % 360)}
                  className="h-7 px-2 rounded-squircle text-xs gap-1 cursor-pointer"
                >
                  <RotateCw className="size-3.5" />
                  <span>90°</span>
                </Button>
              </div>
              {blobUrl && (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-squircle text-xs gap-1.5"
                >
                  <a href={blobUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5 text-primary" />
                    <span>{isAr ? 'فتح بالحجم الكامل' : 'Open full image'}</span>
                  </a>
                </Button>
              )}
            </div>

            {blobUrl && (
              <div className="flex min-h-[52vh] max-h-[64vh] items-center justify-center overflow-auto rounded-xl border border-border/70 bg-card/70 p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={blobUrl}
                  alt={preview.title}
                  className="max-h-[58vh] w-auto object-contain transition-transform duration-150 rounded"
                  style={{
                    transform: `scale(${imageZoom}) rotate(${imageRotation}deg)`,
                  }}
                />
              </div>
            )}
          </div>
        ) : preview?.kind === 'pptx' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/20 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeSlideIdx <= 0}
                  onClick={() => setSlideIdx((idx) => Math.max(0, idx - 1))}
                  className="h-8 w-8 p-0 rounded-squircle cursor-pointer"
                  aria-label={isAr ? 'الشريحة السابقة' : 'Previous slide'}
                >
                  {isAr ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
                </Button>
                <span className="px-2.5 text-xs font-bold text-foreground">
                  {slides.length > 0
                    ? isAr
                      ? `الشريحة ${safeSlideIdx + 1} من ${slides.length}`
                      : `Slide ${safeSlideIdx + 1} of ${slides.length}`
                    : isAr
                      ? '0 شرائح'
                      : '0 slides'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={safeSlideIdx >= slides.length - 1}
                  onClick={() => setSlideIdx((idx) => Math.min(slides.length - 1, idx + 1))}
                  className="h-8 w-8 p-0 rounded-squircle cursor-pointer"
                  aria-label={isAr ? 'الشريحة التالية' : 'Next slide'}
                >
                  {isAr ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
                </Button>
              </div>

              <div className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/70 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setSlideViewMode('visual')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-squircle font-semibold transition-colors cursor-pointer ${
                    slideViewMode === 'visual'
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Presentation className="size-3.5" />
                  <span>{isAr ? 'عرض الشرائح' : 'Slide View'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSlideViewMode('outline')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-squircle font-semibold transition-colors cursor-pointer ${
                    slideViewMode === 'outline'
                      ? 'bg-primary text-white'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="size-3.5" />
                  <span>{isAr ? 'النص المقروء' : 'Reading View'}</span>
                </button>
              </div>
            </div>

            {currentSlide ? (
              <SlideStage
                slide={currentSlide}
                aspectRatio={preview.slideAspectRatio || 16 / 9}
                viewMode={slideViewMode}
                isAr={isAr}
              />
            ) : (
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-8 text-center text-xs text-muted-foreground">
                {isAr
                  ? 'لم يتم العثور على شرائح داخل هذا العرض.'
                  : 'No slides found in this presentation.'}
              </div>
            )}

            {slides.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5">
                {slides.map((s, idx) => {
                  const active = idx === safeSlideIdx;
                  return (
                    <button
                      key={s.index}
                      type="button"
                      onClick={() => setSlideIdx(idx)}
                      title={s.title || (isAr ? `شريحة ${s.index}` : `Slide ${s.index}`)}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-squircle border px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer max-w-44 ${
                        active
                          ? 'border-primary bg-primary/15 text-primary shadow-2xs'
                          : 'border-border/60 bg-card/80 text-muted-foreground hover:text-foreground hover:border-border'
                      }`}
                    >
                      <span className="font-mono text-[11px] font-bold">{s.index}</span>
                      {s.title ? <span className="truncate text-[11px]">{s.title}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}

            {currentSlide?.notes ? (
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-3.5 space-y-1 text-start">
                <p className="text-[11px] font-bold text-muted-foreground">
                  {isAr ? 'ملاحظات المحاضر:' : 'Speaker Notes:'}
                </p>
                <p dir="auto" className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {currentSlide.notes}
                </p>
              </div>
            ) : null}
          </div>
        ) : preview?.kind === 'docx' ? (
          <WordDocumentView
            blocks={preview.blocks ?? []}
            truncated={preview.blocksTruncated}
            isAr={isAr}
          />
        ) : preview?.kind === 'spreadsheet' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/20 p-2.5">
              {sheets.length > 1 ? (
                <div className="flex items-center gap-1 overflow-x-auto">
                  {sheets.map((sheet, idx) => (
                    <button
                      key={`${sheet.name}-${idx}`}
                      type="button"
                      onClick={() => setSheetIdx(idx)}
                      className={`shrink-0 px-3 py-1 rounded-squircle text-xs font-semibold transition-colors cursor-pointer ${
                        idx === safeSheetIdx
                          ? 'bg-primary text-white'
                          : 'bg-card/80 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <bdi>{sheet.name}</bdi>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 text-xs font-bold text-foreground">
                  <FileSpreadsheet className="size-4 text-emerald-500" />
                  <bdi>{currentSheet?.name || preview.fileName}</bdi>
                </span>
              )}

              <div className="relative w-full sm:w-60">
                <Search className="pointer-events-none absolute start-2.5 top-2 size-3.5 text-muted-foreground" />
                <Input
                  type="search"
                  value={sheetSearch}
                  onChange={(e) => setSheetSearch(e.target.value)}
                  placeholder={isAr ? 'بحث داخل الجدول...' : 'Search rows...'}
                  className="h-7 rounded-squircle ps-8 text-xs"
                />
              </div>
            </div>

            {currentSheet && currentSheet.rows.length > 0 ? (
              <div className="overflow-auto max-h-[56vh] rounded-xl border border-border/80 bg-card shadow-2xs">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10 bg-secondary/90 backdrop-blur-xs">
                    <tr>
                      <th className="w-10 px-2 py-2 text-center font-mono text-[10px] text-muted-foreground border-b border-e border-border/60">
                        #
                      </th>
                      {currentSheet.rows[0].map((headerCell, cIdx) => (
                        <th
                          key={cIdx}
                          dir="auto"
                          className="px-3 py-2 text-start font-bold text-foreground border-b border-e border-border/60 whitespace-nowrap"
                        >
                          {headerCell || `${isAr ? 'عمود' : 'Col'} ${cIdx + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSheetRows.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="border-b border-border/40 even:bg-secondary/15 hover:bg-primary/5"
                      >
                        <td className="px-2 py-1.5 text-center font-mono text-[10px] text-muted-foreground border-e border-border/40">
                          {rIdx + 1}
                        </td>
                        {currentSheet.rows[0].map((_, cIdx) => (
                          <td
                            key={cIdx}
                            dir="auto"
                            className="px-3 py-1.5 border-e border-border/40 whitespace-pre-wrap"
                          >
                            {row[cIdx] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-8 text-center text-xs text-muted-foreground">
                {isAr ? 'هذه الورقة فارغة.' : 'This sheet is empty.'}
              </div>
            )}

            {currentSheet?.truncated && (
              <p className="text-[11px] text-muted-foreground text-center">
                {isAr
                  ? 'يتم عرض أول 250 صفاً للمعاينة السريعة. حمّل الملف لعرض كامل البيانات.'
                  : 'Showing the first 250 rows for quick preview. Download the file for full data.'}
              </p>
            )}
          </div>
        ) : preview?.kind === 'archive' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-secondary/20 px-3.5 py-2.5 text-xs">
              <span className="flex items-center gap-2 font-bold text-foreground">
                <FolderArchive className="size-4 text-amber-500" />
                <span>
                  {isAr
                    ? `محتويات الحزمة (${preview.entries?.length ?? 0} ملفات)`
                    : `Bundle Contents (${preview.entries?.length ?? 0} files)`}
                </span>
              </span>
              <span className="text-muted-foreground">
                {isAr
                  ? 'اختر أي ملف لمعاينته أو تحميله منفرداً'
                  : 'Preview or download any file individually'}
              </span>
            </div>

            <div className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card overflow-hidden">
              {(preview.entries ?? []).map((entry) => {
                const canPreviewEntry =
                  entry.previewKind !== 'unsupported' && entry.previewKind !== 'archive';
                const meta = getFileTypeMeta(entry.name, entry.mimeType);
                return (
                  <div
                    key={entry.name}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 hover:bg-secondary/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileTypeIcon fileName={entry.name} mimeType={entry.mimeType} size="md" />
                      <div className="min-w-0 text-start">
                        <p className="text-xs font-bold text-foreground truncate">
                          <bdi>{entry.name}</bdi>
                        </p>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span
                            className={`inline-flex items-center rounded-squircle border px-1.5 py-0.2 font-mono text-[10px] font-bold ${meta.bgClass} ${meta.borderClass} ${meta.textClass}`}
                          >
                            {meta.label}
                          </span>
                          {entry.size > 0 && (
                            <>
                              <span>·</span>
                              <bdi dir="ltr">{formatSize(entry.size)}</bdi>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      {canPreviewEntry && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEntryPreview(entry.name)}
                          className="h-8 rounded-squircle border-primary/35 bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold gap-1.5 cursor-pointer"
                        >
                          <Eye className="size-3.5" />
                          <span>{isAr ? 'معاينة' : 'Preview'}</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          void handleDownloadTarget(entry.name, entry.name.split('/').pop())
                        }
                        disabled={isDownloading}
                        className="h-8 rounded-squircle text-xs font-semibold gap-1.5 cursor-pointer"
                      >
                        <Download className="size-3.5 text-primary" />
                        <span>{isAr ? 'تحميل' : 'Download'}</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-secondary/20 p-8 text-center space-y-3">
            <div className="flex justify-center">
              <FileTypeIcon fileName={activeFileName} mimeType={activeMimeType} size="lg" />
            </div>
            <p className="text-sm font-bold text-foreground">
              <bdi>{activeFileName}</bdi>
            </p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
              {preview?.unsupportedReason === 'legacy_office'
                ? isAr
                  ? 'هذا الملف محفوظ بصيغة Office قديمة (.doc / .ppt / .xls). يرجى تحميله لفتحه مباشرة على جهازك، أو رفعه بصيغة حديثة (.pptx / .docx / .xlsx / .pdf) للمعاينة الفورية.'
                  : 'This file uses a legacy binary Office format (.doc / .ppt / .xls). Download it to view on your device, or upload modern OOXML/PDF for instant preview.'
                : isAr
                  ? 'لا تتوفر معاينة مباشرة لهذا الامتداد داخل المتصفح. يمكنك تحميل الملف لفتحه على جهازك.'
                  : 'Direct browser preview is not available for this format. You can download the file to open it locally.'}
            </p>
            <div className="pt-1">
              <Button
                type="button"
                size="sm"
                onClick={() => void handleDownloadTarget()}
                disabled={isDownloading}
                className="rounded-squircle bg-primary text-white hover:bg-primary-hover text-xs font-semibold gap-1.5 cursor-pointer"
              >
                {isDownloading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Download className="size-3.5" />
                )}
                <span>{isAr ? 'تحميل الملف الآن' : 'Download File Now'}</span>
              </Button>
            </div>
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {hasFile && !isMissingFileError && (
          <Button
            type="button"
            size="sm"
            onClick={() => void handleDownloadTarget()}
            disabled={isDownloading}
            className="rounded-squircle bg-primary text-white hover:bg-primary-hover text-xs font-semibold gap-1.5 cursor-pointer"
          >
            {isDownloading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span>
              {selectedEntry
                ? isAr
                  ? 'تحميل هذا الملف'
                  : 'Download this file'
                : (material.attachments?.length ?? 0) > 1
                  ? isAr
                    ? 'تحميل الحزمة كاملة (ZIP)'
                    : 'Download full bundle (ZIP)'
                  : isAr
                    ? 'تحميل الملف'
                    : 'Download'}
            </span>
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClose}
          className="rounded-squircle text-xs cursor-pointer"
        >
          {isAr ? 'إغلاق' : 'Close'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function CourseMaterialPreviewDialog({
  material,
  open,
  onOpenChange,
  courseCode,
  locale,
}: CourseMaterialPreviewDialogProps) {
  const isAr = locale === 'ar';

  return (
    <Dialog open={open && Boolean(material)} onOpenChange={onOpenChange}>
      {open && material ? (
        <PreviewViewport
          key={`${material._id}:${material.updatedAt ?? ''}`}
          material={material}
          courseCode={courseCode}
          locale={locale}
          isAr={isAr}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}
