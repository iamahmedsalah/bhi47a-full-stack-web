import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { extname, posix } from 'node:path';
import JSZip from 'jszip';
import * as ExcelJS from 'exceljs';
import {
  COURSE_MATERIAL_MAX_BYTES,
  type CourseMaterialPreviewResponse,
  type MaterialPreviewArchiveEntry,
  type MaterialPreviewDocBlock,
  type MaterialPreviewKind,
  type MaterialPreviewParagraph,
  type MaterialPreviewSheet,
  type MaterialPreviewSlide,
  type MaterialPreviewSlideElement,
  type MaterialPreviewTextRun,
} from '@student-portal/shared';

const MAX_EXTRACTED_BYTES = 18 * 1024 * 1024;
const MAX_MEDIA_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_SINGLE_MEDIA_BYTES = 2.5 * 1024 * 1024;
const MAX_PREVIEW_SLIDES = 60;
const MAX_PREVIEW_DOC_BLOCKS = 400;
const MAX_SHEET_ROWS = 250;
const MAX_SHEET_COLS = 30;

const EXTENSION_MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

const SAFE_IMAGE_MIMES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const RTL_CHAR_REGEX = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
const LTR_CHAR_REGEX = /[A-Za-z]/;

interface BoxGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ExtractedArchiveEntry {
  name: string;
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

export function getMaterialPreviewKind(
  fileName?: string,
  mimeType?: string,
): MaterialPreviewKind {
  const ext = resolveExtension(fileName, mimeType);
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (ext === 'pptx') return 'pptx';
  if (ext === 'docx') return 'docx';
  if (['xlsx', 'csv'].includes(ext)) return 'spreadsheet';
  if (ext === 'zip') return 'archive';
  return 'unsupported';
}

function resolveExtension(fileName?: string, mimeType?: string): string {
  if (fileName) {
    const ext = extname(fileName.trim()).slice(1).toLowerCase();
    if (ext) return ext;
  }
  const cleanMime = mimeType?.split(';')[0]?.trim().toLowerCase() ?? '';
  for (const [ext, candidate] of Object.entries(EXTENSION_MIMES)) {
    if (candidate === cleanMime) return ext;
  }
  return '';
}

function decodeXmlEntities(raw: string): string {
  if (!raw || !raw.includes('&')) return raw;
  return raw.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g,
    (match, entity: string) => {
      if (entity === 'lt') return '<';
      if (entity === 'gt') return '>';
      if (entity === 'amp') return '&';
      if (entity === 'quot') return '"';
      if (entity === 'apos') return "'";
      if (entity.startsWith('#x') || entity.startsWith('#X')) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) && code > 0
          ? String.fromCodePoint(code)
          : match;
      }
      if (entity.startsWith('#')) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0
          ? String.fromCodePoint(code)
          : match;
      }
      return match;
    },
  );
}

function detectDirection(text: string, explicitRtl?: boolean): 'rtl' | 'ltr' {
  if (explicitRtl === true) return 'rtl';
  if (explicitRtl === false) return 'ltr';
  for (const ch of text) {
    if (RTL_CHAR_REGEX.test(ch)) return 'rtl';
    if (LTR_CHAR_REGEX.test(ch)) return 'ltr';
  }
  return 'ltr';
}

function normalizeArchiveEntryPath(entryPath: string): string {
  const normalized = entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (
    !normalized ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new BadRequestException('Invalid archive entry path');
  }
  return normalized;
}

function resolveZipRelativePath(baseFile: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const dir = posix.dirname(baseFile);
  return posix.normalize(posix.join(dir, target)).replace(/^\/+/, '');
}

function getAttr(tag: string, attrName: string): string | undefined {
  const escaped = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\s)${escaped}="([^"]*)"`).exec(tag);
  return match ? decodeXmlEntities(match[1]) : undefined;
}

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function parseHexColor(val?: string): string | undefined {
  if (!val) return undefined;
  const clean = val.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return `#${clean.toUpperCase()}`;
  }
  return undefined;
}

@Injectable()
export class MaterialPreviewService {
  async buildPreview(params: {
    materialId: string;
    title: string;
    fileName: string;
    mimeType?: string;
    fileSize?: number;
    videoUrl?: string;
    buffer?: Buffer;
    entryName?: string;
  }): Promise<CourseMaterialPreviewResponse> {
    const { materialId, title, videoUrl, entryName } = params;

    if (!params.buffer) {
      if (videoUrl) {
        return {
          materialId,
          title,
          fileName: params.fileName,
          mimeType: params.mimeType || 'video/external',
          fileSize: params.fileSize,
          kind: 'video',
          videoUrl,
        };
      }
      throw new NotFoundException('Material file is unavailable for preview');
    }

    let targetBuffer = params.buffer;
    let targetFileName = params.fileName;
    let targetMimeType =
      params.mimeType ||
      EXTENSION_MIMES[resolveExtension(params.fileName)] ||
      'application/octet-stream';
    let targetSize = params.fileSize ?? targetBuffer.length;

    if (entryName) {
      const extracted = await this.extractSingleZipEntry(
        targetBuffer,
        entryName,
      );
      targetBuffer = extracted.buffer;
      targetFileName = extracted.name;
      targetMimeType = extracted.mimeType;
      targetSize = extracted.buffer.length;
    }

    const ext = resolveExtension(targetFileName, targetMimeType);
    const kind = getMaterialPreviewKind(targetFileName, targetMimeType);

    const base: CourseMaterialPreviewResponse = {
      materialId,
      title,
      fileName: targetFileName,
      mimeType: targetMimeType,
      fileSize: targetSize,
      ...(entryName ? { entryName } : {}),
      kind,
      ...(videoUrl && !entryName ? { videoUrl } : {}),
    };

    if (kind === 'pdf' || kind === 'image') {
      return base;
    }

    if (kind === 'pptx') {
      const pptxData = await this.parsePptx(targetBuffer);
      return {
        ...base,
        ...pptxData,
      };
    }

    if (kind === 'docx') {
      const docxData = await this.parseDocx(targetBuffer);
      return {
        ...base,
        ...docxData,
      };
    }

    if (kind === 'spreadsheet') {
      const sheets =
        ext === 'csv'
          ? [this.parseCsv(targetBuffer, targetFileName)]
          : await this.parseXlsx(targetBuffer);
      return {
        ...base,
        sheets,
      };
    }

    if (kind === 'archive') {
      const entries = await this.listZipEntries(targetBuffer);
      return {
        ...base,
        entries,
      };
    }

    return {
      ...base,
      kind: 'unsupported',
      unsupportedReason: ['doc', 'ppt', 'xls'].includes(ext)
        ? 'legacy_office'
        : ext === 'rar'
          ? 'rar_archive'
          : 'unsupported_format',
    };
  }

  async extractSingleZipEntry(
    zipBuffer: Buffer,
    entryName: string,
  ): Promise<ExtractedArchiveEntry> {
    const safeName = normalizeArchiveEntryPath(entryName);
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(zipBuffer, { checkCRC32: true });
    } catch {
      throw new BadRequestException('Invalid ZIP archive');
    }

    const file = archive.file(safeName);
    if (!file || file.dir) {
      throw new NotFoundException('Requested file was not found in the bundle');
    }

    const declaredSize = (
      file as unknown as { _data?: { uncompressedSize?: number } }
    )._data?.uncompressedSize;
    if (
      typeof declaredSize === 'number' &&
      (declaredSize < 0 || declaredSize > COURSE_MATERIAL_MAX_BYTES)
    ) {
      throw new BadRequestException('Archive entry exceeds preview size limit');
    }

    const content = await file.async('nodebuffer');
    if (content.length > COURSE_MATERIAL_MAX_BYTES) {
      throw new BadRequestException('Archive entry exceeds preview size limit');
    }

    const extension = resolveExtension(safeName);
    const mimeType = EXTENSION_MIMES[extension] || 'application/octet-stream';
    return {
      name: safeName,
      buffer: content,
      mimeType,
      extension,
    };
  }

  private async listZipEntries(
    zipBuffer: Buffer,
  ): Promise<MaterialPreviewArchiveEntry[]> {
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(zipBuffer, { checkCRC32: true });
    } catch {
      throw new BadRequestException('Invalid ZIP archive');
    }

    const items: MaterialPreviewArchiveEntry[] = [];
    for (const [rawName, entry] of Object.entries(archive.files)) {
      if (entry.dir) continue;
      if (rawName.startsWith('__MACOSX/') || rawName.endsWith('.DS_Store')) {
        continue;
      }
      const extension = resolveExtension(rawName);
      const mimeType = EXTENSION_MIMES[extension] || 'application/octet-stream';
      const declaredSize =
        (entry as unknown as { _data?: { uncompressedSize?: number } })._data
          ?.uncompressedSize ?? 0;
      items.push({
        name: rawName,
        size: Math.max(0, declaredSize),
        extension,
        mimeType,
        previewKind: getMaterialPreviewKind(rawName, mimeType),
      });
      if (items.length >= 100) break;
    }
    return items;
  }

  private createBudgetReader(archive: JSZip) {
    let usedBytes = 0;
    let mediaBytes = 0;

    return {
      readText: async (entryPath: string): Promise<string | null> => {
        const file = archive.file(entryPath);
        if (!file || file.dir) return null;
        const declared = (
          file as unknown as { _data?: { uncompressedSize?: number } }
        )._data?.uncompressedSize;
        if (
          typeof declared === 'number' &&
          usedBytes + declared > MAX_EXTRACTED_BYTES
        ) {
          throw new BadRequestException('Document is too large to preview');
        }
        const buf = await file.async('nodebuffer');
        usedBytes += buf.length;
        if (usedBytes > MAX_EXTRACTED_BYTES) {
          throw new BadRequestException('Document is too large to preview');
        }
        return buf.toString('utf8');
      },
      readImageDataUrl: async (entryPath: string): Promise<string | null> => {
        const ext = resolveExtension(entryPath);
        const mime = SAFE_IMAGE_MIMES[ext];
        if (!mime) return null;
        const file = archive.file(entryPath);
        if (!file || file.dir) return null;
        const declared = (
          file as unknown as { _data?: { uncompressedSize?: number } }
        )._data?.uncompressedSize;
        if (
          typeof declared === 'number' &&
          (declared > MAX_SINGLE_MEDIA_BYTES ||
            mediaBytes + declared > MAX_MEDIA_TOTAL_BYTES)
        ) {
          return null;
        }
        const buf = await file.async('nodebuffer');
        if (
          buf.length > MAX_SINGLE_MEDIA_BYTES ||
          mediaBytes + buf.length > MAX_MEDIA_TOTAL_BYTES
        ) {
          return null;
        }
        mediaBytes += buf.length;
        usedBytes += buf.length;
        if (usedBytes > MAX_EXTRACTED_BYTES) return null;
        return `data:${mime};base64,${buf.toString('base64')}`;
      },
    };
  }

  private parseRelationships(relsXml: string | null, ownerPath: string) {
    const map = new Map<string, string>();
    if (!relsXml) return map;
    const relRegex = /<Relationship\b([^>]*?)\/?>/g;
    let match: RegExpExecArray | null;
    while ((match = relRegex.exec(relsXml)) !== null) {
      const attrs = match[1];
      const id = getAttr(attrs, 'Id');
      const target = getAttr(attrs, 'Target');
      const mode = getAttr(attrs, 'TargetMode');
      if (id && target && mode !== 'External') {
        map.set(id, resolveZipRelativePath(ownerPath, target));
      }
    }
    return map;
  }

  private parseXfrmBox(
    xmlFragment: string,
    slideCx: number,
    slideCy: number,
  ): BoxGeometry | null {
    const xfrmMatch =
      /<(?:[a-zA-Z0-9]+:)?xfrm\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9]+:)?xfrm>/.exec(
        xmlFragment,
      );
    if (!xfrmMatch) return null;
    const inner = xfrmMatch[1];
    const offMatch = /<(?:[a-zA-Z0-9]+:)?off\b([^>]*)\/?>/.exec(inner);
    const extMatch = /<(?:[a-zA-Z0-9]+:)?ext\b([^>]*)\/?>/.exec(inner);
    if (!offMatch || !extMatch) return null;
    const x = Number.parseInt(getAttr(offMatch[1], 'x') ?? '', 10);
    const y = Number.parseInt(getAttr(offMatch[1], 'y') ?? '', 10);
    const cx = Number.parseInt(getAttr(extMatch[1], 'cx') ?? '', 10);
    const cy = Number.parseInt(getAttr(extMatch[1], 'cy') ?? '', 10);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(cx) ||
      !Number.isFinite(cy) ||
      cx <= 0 ||
      cy <= 0
    ) {
      return null;
    }
    return {
      x: clampPercent((x / slideCx) * 100, 5),
      y: clampPercent((y / slideCy) * 100, 10),
      w: Math.max(4, clampPercent((cx / slideCx) * 100, 80)),
      h: Math.max(4, clampPercent((cy / slideCy) * 100, 15)),
    };
  }

  private parseLayoutPlaceholders(
    layoutXml: string | null,
    slideCx: number,
    slideCy: number,
  ): Map<string, BoxGeometry> {
    const boxes = new Map<string, BoxGeometry>();
    if (!layoutXml) return boxes;
    const spRegex = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;
    let match: RegExpExecArray | null;
    while ((match = spRegex.exec(layoutXml)) !== null) {
      const spXml = match[1];
      const phMatch = /<p:ph\b([^>]*)\/?>/.exec(spXml);
      if (!phMatch) continue;
      const spPrMatch = /<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/.exec(spXml);
      if (!spPrMatch) continue;
      const box = this.parseXfrmBox(spPrMatch[1], slideCx, slideCy);
      if (!box) continue;
      const phType = getAttr(phMatch[1], 'type');
      const phIdx = getAttr(phMatch[1], 'idx');
      if (phType) boxes.set(`type:${phType}`, box);
      if (phIdx) boxes.set(`idx:${phIdx}`, box);
    }
    return boxes;
  }

  private parseDrawingParagraphs(
    txBodyXml: string,
    isTitleShape: boolean,
  ): MaterialPreviewParagraph[] {
    const paragraphs: MaterialPreviewParagraph[] = [];
    const pRegex = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
    let pMatch: RegExpExecArray | null;

    while ((pMatch = pRegex.exec(txBodyXml)) !== null) {
      const pXml = pMatch[1];
      const pPrMatch = /<a:pPr\b([^>]*)(?:\/>|>([\s\S]*?)<\/a:pPr>)/.exec(pXml);
      const pPrAttrs = pPrMatch?.[1] ?? '';
      const pPrInner = pPrMatch?.[2] ?? '';

      const algn = getAttr(pPrAttrs, 'algn');
      const rtlAttr = getAttr(pPrAttrs, 'rtl');
      const lvlAttr = getAttr(pPrAttrs, 'lvl');
      const explicitRtl =
        rtlAttr === '1' || rtlAttr === 'true'
          ? true
          : rtlAttr === '0' || rtlAttr === 'false'
            ? false
            : undefined;

      const hasBuNone = /<a:buNone\b/.test(pPrInner);
      const hasExplicitBullet = /<a:bu(?:Char|AutoNum|Blip)\b/.test(pPrInner);
      const parsedLvl = lvlAttr ? Number.parseInt(lvlAttr, 10) : 0;
      const bulletLevel =
        !isTitleShape && !hasBuNone && (hasExplicitBullet || parsedLvl > 0)
          ? Math.min(4, Math.max(0, Number.isFinite(parsedLvl) ? parsedLvl : 0))
          : undefined;

      const runs: MaterialPreviewTextRun[] = [];
      const tokenRegex =
        /<a:(r|fld|br)\b[^>]*>([\s\S]*?)<\/a:\1>|<a:br\b[^>]*\/>/g;
      let tokenMatch: RegExpExecArray | null;

      while ((tokenMatch = tokenRegex.exec(pXml)) !== null) {
        const fullToken = tokenMatch[0];
        if (fullToken.startsWith('<a:br')) {
          runs.push({ text: '\n' });
          continue;
        }
        const rInner = tokenMatch[2] ?? '';
        const tMatches = Array.from(
          rInner.matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g),
        );
        if (!tMatches.length) continue;
        const text = tMatches.map((m) => decodeXmlEntities(m[1])).join('');
        if (!text) continue;

        const rPrMatch = /<a:rPr\b([^>]*)(?:\/>|>([\s\S]*?)<\/a:rPr>)/.exec(
          rInner,
        );
        const rPrAttrs = rPrMatch?.[1] ?? '';
        const rPrInner = rPrMatch?.[2] ?? '';
        const bAttr = getAttr(rPrAttrs, 'b');
        const iAttr = getAttr(rPrAttrs, 'i');
        const uAttr = getAttr(rPrAttrs, 'u');
        const szAttr = getAttr(rPrAttrs, 'sz');
        const clrMatch = /<a:srgbClr\b[^>]*val="([0-9a-fA-F]{6})"/.exec(
          rPrInner,
        );

        const szHundredths = szAttr ? Number.parseInt(szAttr, 10) : NaN;
        const fontSizePt =
          Number.isFinite(szHundredths) &&
          szHundredths >= 600 &&
          szHundredths <= 9600
            ? Math.round(szHundredths / 100)
            : undefined;

        runs.push({
          text,
          ...(bAttr === '1' || bAttr === 'true' ? { bold: true } : {}),
          ...(iAttr === '1' || iAttr === 'true' ? { italic: true } : {}),
          ...(uAttr && uAttr !== 'none' ? { underline: true } : {}),
          ...(clrMatch ? { color: parseHexColor(clrMatch[1]) } : {}),
          ...(fontSizePt ? { fontSizePt } : {}),
        });
      }

      const combinedText = runs
        .map((r) => r.text)
        .join('')
        .trim();
      if (!combinedText) continue;

      const dir = detectDirection(combinedText, explicitRtl);
      const align: MaterialPreviewParagraph['align'] =
        algn === 'ctr'
          ? 'center'
          : algn === 'r'
            ? 'right'
            : algn === 'l'
              ? 'left'
              : algn === 'just'
                ? 'justify'
                : undefined;

      paragraphs.push({
        runs,
        dir,
        ...(align ? { align } : {}),
        ...(bulletLevel !== undefined ? { bulletLevel } : {}),
        ...(isTitleShape ? { isTitle: true } : {}),
      });
    }

    return paragraphs;
  }

  private async parsePptx(buffer: Buffer): Promise<{
    slideAspectRatio: number;
    slides: MaterialPreviewSlide[];
    totalSlides: number;
    slidesTruncated?: boolean;
  }> {
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(buffer, { checkCRC32: true });
    } catch {
      throw new BadRequestException('Invalid PowerPoint document');
    }

    const reader = this.createBudgetReader(archive);
    const presentationXml = await reader.readText('ppt/presentation.xml');
    if (!presentationXml) {
      throw new BadRequestException(
        'Invalid PowerPoint presentation structure',
      );
    }

    let slideCx = 12192000;
    let slideCy = 6858000;
    const sldSzMatch = /<(?:[a-zA-Z0-9]+:)?sldSz\b([^>]*)\/?>/.exec(
      presentationXml,
    );
    if (sldSzMatch) {
      const cx = Number.parseInt(getAttr(sldSzMatch[1], 'cx') ?? '', 10);
      const cy = Number.parseInt(getAttr(sldSzMatch[1], 'cy') ?? '', 10);
      if (Number.isFinite(cx) && Number.isFinite(cy) && cx > 0 && cy > 0) {
        slideCx = cx;
        slideCy = cy;
      }
    }
    const slideAspectRatio = Math.round((slideCx / slideCy) * 10000) / 10000;

    const presRels = this.parseRelationships(
      await reader.readText('ppt/_rels/presentation.xml.rels'),
      'ppt/presentation.xml',
    );

    const orderedSlidePaths: string[] = [];
    const sldIdRegex = /<(?:[a-zA-Z0-9]+:)?sldId\b([^>]*)\/?>/g;
    let sldMatch: RegExpExecArray | null;
    while ((sldMatch = sldIdRegex.exec(presentationXml)) !== null) {
      const rId =
        getAttr(sldMatch[1], 'r:id') ??
        getAttr(sldMatch[1], 'relationships:id');
      const resolved = rId ? presRels.get(rId) : undefined;
      if (resolved && archive.file(resolved)) {
        orderedSlidePaths.push(resolved);
      }
    }

    if (orderedSlidePaths.length === 0) {
      const fallbackSlides = Object.keys(archive.files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
          const numA = Number.parseInt(/\d+/.exec(a)?.[0] ?? '0', 10);
          const numB = Number.parseInt(/\d+/.exec(b)?.[0] ?? '0', 10);
          return numA - numB;
        });
      orderedSlidePaths.push(...fallbackSlides);
    }

    const totalSlides = orderedSlidePaths.length;
    const slidesTruncated = totalSlides > MAX_PREVIEW_SLIDES;
    const targetPaths = orderedSlidePaths.slice(0, MAX_PREVIEW_SLIDES);

    const layoutCache = new Map<string, Map<string, BoxGeometry>>();
    const mediaCache = new Map<string, string | null>();
    const slides: MaterialPreviewSlide[] = [];

    for (let i = 0; i < targetPaths.length; i++) {
      const slidePath = targetPaths[i];
      const slideXml = await reader.readText(slidePath);
      if (!slideXml) continue;

      const relsPath = posix.join(
        posix.dirname(slidePath),
        '_rels',
        `${posix.basename(slidePath)}.rels`,
      );
      const slideRels = this.parseRelationships(
        await reader.readText(relsPath),
        slidePath,
      );

      let layoutBoxes = new Map<string, BoxGeometry>();
      let inheritedBgColor: string | undefined;
      for (const target of slideRels.values()) {
        if (target.startsWith('ppt/slideLayouts/')) {
          const layoutXml = await reader.readText(target);
          if (!layoutCache.has(target)) {
            layoutCache.set(
              target,
              this.parseLayoutPlaceholders(layoutXml, slideCx, slideCy),
            );
          }
          layoutBoxes = layoutCache.get(target)!;
          const layoutBgMatch = layoutXml
            ? /<(?:[a-zA-Z0-9]+:)?bg\b[\s\S]*?<a:srgbClr\b[^>]*val="([0-9a-fA-F]{6})"[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?bg>/.exec(
                layoutXml,
              )
            : null;
          if (layoutBgMatch) {
            inheritedBgColor = parseHexColor(layoutBgMatch[1]);
          } else {
            const layoutRelsPath = posix.join(
              posix.dirname(target),
              '_rels',
              `${posix.basename(target)}.rels`,
            );
            const layoutRels = this.parseRelationships(
              await reader.readText(layoutRelsPath),
              target,
            );
            for (const masterTarget of layoutRels.values()) {
              if (masterTarget.startsWith('ppt/slideMasters/')) {
                const masterXml = await reader.readText(masterTarget);
                const masterBgMatch = masterXml
                  ? /<(?:[a-zA-Z0-9]+:)?bg\b[\s\S]*?<a:srgbClr\b[^>]*val="([0-9a-fA-F]{6})"[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?bg>/.exec(
                      masterXml,
                    )
                  : null;
                if (masterBgMatch) {
                  inheritedBgColor = parseHexColor(masterBgMatch[1]);
                }
                break;
              }
            }
          }
          break;
        }
      }

      const bgClrMatch =
        /<(?:[a-zA-Z0-9]+:)?bg\b[\s\S]*?<a:srgbClr\b[^>]*val="([0-9a-fA-F]{6})"[\s\S]*?<\/(?:[a-zA-Z0-9]+:)?bg>/.exec(
          slideXml,
        );
      const backgroundColor = bgClrMatch
        ? parseHexColor(bgClrMatch[1])
        : inheritedBgColor;

      const elements: MaterialPreviewSlideElement[] = [];
      const outline: MaterialPreviewParagraph[] = [];
      let slideTitle: string | undefined;
      let fallbackBodyY = 24;

      // 1. Parse text shapes (<p:sp>)
      const spRegex = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;
      let spMatch: RegExpExecArray | null;
      while ((spMatch = spRegex.exec(slideXml)) !== null) {
        const spXml = spMatch[1];
        const phMatch = /<p:ph\b([^>]*)\/?>/.exec(spXml);
        const phType = phMatch ? getAttr(phMatch[1], 'type') : undefined;
        const phIdx = phMatch ? getAttr(phMatch[1], 'idx') : undefined;

        if (phType === 'sldNum' || phType === 'dt' || phType === 'ftr') {
          continue;
        }

        const isTitleShape =
          phType === 'title' || phType === 'ctrTitle' || phType === 'subTitle';
        const txBodyMatch = /<p:txBody\b[^>]*>([\s\S]*?)<\/p:txBody>/.exec(
          spXml,
        );
        if (!txBodyMatch) continue;

        const paragraphs = this.parseDrawingParagraphs(
          txBodyMatch[1],
          isTitleShape && phType !== 'subTitle',
        );
        if (paragraphs.length === 0) continue;

        if (!slideTitle && (phType === 'title' || phType === 'ctrTitle')) {
          slideTitle = paragraphs[0].runs
            .map((r) => r.text)
            .join('')
            .trim();
        }

        const spPrMatch = /<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/.exec(spXml);
        const fillMatch = spPrMatch
          ? /<a:solidFill>[\s\S]*?<a:srgbClr\b[^>]*val="([0-9a-fA-F]{6})"/.exec(
              spPrMatch[1],
            )
          : null;

        let box = spPrMatch
          ? this.parseXfrmBox(spPrMatch[1], slideCx, slideCy)
          : null;
        if (!box && phType && layoutBoxes.has(`type:${phType}`)) {
          box = layoutBoxes.get(`type:${phType}`)!;
        }
        if (!box && phIdx && layoutBoxes.has(`idx:${phIdx}`)) {
          box = layoutBoxes.get(`idx:${phIdx}`)!;
        }
        if (!box) {
          if (phType === 'title' || phType === 'ctrTitle') {
            box = { x: 6, y: 6, w: 88, h: 15 };
          } else if (phType === 'subTitle') {
            box = { x: 10, y: 24, w: 80, h: 14 };
            fallbackBodyY = 40;
          } else {
            const estHeight = Math.min(
              92 - fallbackBodyY,
              Math.max(16, paragraphs.length * 9),
            );
            box = {
              x: 6,
              y: Math.min(84, fallbackBodyY),
              w: 88,
              h: Math.max(12, estHeight),
            };
            fallbackBodyY = Math.min(88, fallbackBodyY + estHeight + 3);
          }
        }

        elements.push({
          kind: 'text',
          ...box,
          paragraphs,
          ...(fillMatch ? { fillColor: parseHexColor(fillMatch[1]) } : {}),
          ...(phType === 'title' || phType === 'ctrTitle'
            ? { isPlaceholderTitle: true }
            : {}),
        });
        outline.push(...paragraphs);
      }

      // 2. Parse tables (<p:graphicFrame> containing <a:tbl>)
      const gfRegex = /<p:graphicFrame\b[^>]*>([\s\S]*?)<\/p:graphicFrame>/g;
      let gfMatch: RegExpExecArray | null;
      while ((gfMatch = gfRegex.exec(slideXml)) !== null) {
        const gfXml = gfMatch[1];
        const tblMatch = /<a:tbl\b[^>]*>([\s\S]*?)<\/a:tbl>/.exec(gfXml);
        if (!tblMatch) continue;
        const rows: string[][] = [];
        const trRegex = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g;
        let trMatch: RegExpExecArray | null;
        while ((trMatch = trRegex.exec(tblMatch[1])) !== null) {
          const rowCells: string[] = [];
          const tcRegex = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g;
          let tcMatch: RegExpExecArray | null;
          while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
            const cellParas = this.parseDrawingParagraphs(tcMatch[1], false);
            rowCells.push(
              cellParas
                .map((p) => p.runs.map((r) => r.text).join(''))
                .join('\n')
                .trim(),
            );
          }
          if (rowCells.some(Boolean)) rows.push(rowCells);
        }
        if (rows.length > 0) {
          const box = this.parseXfrmBox(gfXml, slideCx, slideCy) ?? {
            x: 6,
            y: Math.min(80, fallbackBodyY),
            w: 88,
            h: 45,
          };
          elements.push({
            kind: 'table',
            ...box,
            rows,
          });
        }
      }

      // 3. Parse pictures (<p:pic>)
      const picRegex = /<p:pic\b[^>]*>([\s\S]*?)<\/p:pic>/g;
      let picMatch: RegExpExecArray | null;
      while ((picMatch = picRegex.exec(slideXml)) !== null) {
        const picXml = picMatch[1];
        const blipMatch = /<a:blip\b([^>]*)\/?>/.exec(picXml);
        const embedId = blipMatch
          ? getAttr(blipMatch[1], 'r:embed')
          : undefined;
        const mediaPath = embedId ? slideRels.get(embedId) : undefined;
        if (!mediaPath) continue;

        if (!mediaCache.has(mediaPath)) {
          mediaCache.set(mediaPath, await reader.readImageDataUrl(mediaPath));
        }
        const dataUrl = mediaCache.get(mediaPath);
        if (!dataUrl) continue;

        const spPrMatch = /<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/.exec(picXml);
        const box = (spPrMatch
          ? this.parseXfrmBox(spPrMatch[1], slideCx, slideCy)
          : null) ?? {
          x: 15,
          y: 22,
          w: 70,
          h: 65,
        };
        const cNvPrMatch = /<p:cNvPr\b([^>]*)\/?>/.exec(picXml);
        const descr = cNvPrMatch ? getAttr(cNvPrMatch[1], 'descr') : undefined;

        elements.push({
          kind: 'image',
          ...box,
          dataUrl,
          ...(descr ? { alt: descr } : {}),
        });
      }

      // 3.5. Parse SmartArt diagrams (ppt/diagrams/drawing*.xml or data*.xml) if linked
      for (const target of slideRels.values()) {
        if (target.startsWith('ppt/diagrams/data') && target.endsWith('.xml')) {
          const diagramXml = await reader.readText(target);
          if (!diagramXml) continue;
          const diagParas: MaterialPreviewParagraph[] = [];
          const tBlocks = Array.from(
            diagramXml.matchAll(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g),
          );
          for (const block of tBlocks) {
            const parsed = this.parseDrawingParagraphs(block[0], false);
            for (const p of parsed) {
              diagParas.push({ ...p, bulletLevel: p.bulletLevel ?? 0 });
            }
          }
          if (diagParas.length > 0) {
            elements.push({
              kind: 'text',
              x: 6,
              y: Math.min(82, fallbackBodyY),
              w: 88,
              h: Math.max(24, 90 - fallbackBodyY),
              paragraphs: diagParas,
            });
            outline.push(...diagParas);
          }
        }
      }

      if (!slideTitle && outline.length > 0) {
        slideTitle = outline[0].runs
          .map((r) => r.text)
          .join('')
          .trim()
          .slice(0, 120);
      }

      // 4. Optional speaker notes
      let notes: string | undefined;
      for (const target of slideRels.values()) {
        if (target.startsWith('ppt/notesSlides/')) {
          const notesXml = await reader.readText(target);
          if (notesXml) {
            const notesSpRegex = /<p:sp\b[^>]*>([\s\S]*?)<\/p:sp>/g;
            const noteLines: string[] = [];
            let nMatch: RegExpExecArray | null;
            while ((nMatch = notesSpRegex.exec(notesXml)) !== null) {
              const nSp = nMatch[1];
              const ph = /<p:ph\b([^>]*)\/?>/.exec(nSp);
              const phType = ph ? getAttr(ph[1], 'type') : undefined;
              if (phType && phType !== 'body') continue;
              const tx = /<p:txBody\b[^>]*>([\s\S]*?)<\/p:txBody>/.exec(nSp);
              if (!tx) continue;
              const paras = this.parseDrawingParagraphs(tx[1], false);
              for (const p of paras) {
                const line = p.runs
                  .map((r) => r.text)
                  .join('')
                  .trim();
                if (line) noteLines.push(line);
              }
            }
            if (noteLines.length > 0) {
              notes = noteLines.join('\n');
            }
          }
          break;
        }
      }

      slides.push({
        index: i + 1,
        ...(slideTitle ? { title: slideTitle } : {}),
        elements,
        outline,
        ...(notes ? { notes } : {}),
        ...(backgroundColor ? { backgroundColor } : {}),
      });
    }

    return {
      slideAspectRatio,
      slides,
      totalSlides,
      ...(slidesTruncated ? { slidesTruncated: true } : {}),
    };
  }

  private parseWordParagraph(pXml: string): {
    paragraph: MaterialPreviewParagraph | null;
    headingLevel?: 1 | 2 | 3 | 4;
    isList?: boolean;
    embedIds: string[];
  } {
    const pPrMatch = /<w:pPr\b[^>]*>([\s\S]*?)<\/w:pPr>/.exec(pXml);
    const pPr = pPrMatch?.[1] ?? '';

    const styleMatch = /<w:pStyle\b[^>]*w:val="([^"]+)"/.exec(pPr);
    const styleVal = styleMatch?.[1] ?? '';
    let headingLevel: 1 | 2 | 3 | 4 | undefined;
    if (/^(?:Title|Heading1|1)$/i.test(styleVal)) headingLevel = 1;
    else if (/^(?:Subtitle|Heading2|2)$/i.test(styleVal)) headingLevel = 2;
    else if (/^(?:Heading3|3)$/i.test(styleVal)) headingLevel = 3;
    else if (/^(?:Heading[4-9]|[4-6])$/i.test(styleVal)) headingLevel = 4;

    const isList = /<w:numPr\b/.test(pPr);
    const ilvlMatch = /<w:ilvl\b[^>]*w:val="(\d+)"/.exec(pPr);
    const bulletLevel = isList
      ? Math.min(4, Number.parseInt(ilvlMatch?.[1] ?? '0', 10) || 0)
      : undefined;

    const hasBidi = /<w:bidi\b(?![^>]*w:val="(?:0|false)")/.test(pPr);
    const jcMatch = /<w:jc\b[^>]*w:val="([^"]+)"/.exec(pPr);
    const jcVal = jcMatch?.[1];

    const embedIds = Array.from(
      pXml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/g),
      (m) => m[1],
    );

    const runs: MaterialPreviewTextRun[] = [];
    const rRegex = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
    let rMatch: RegExpExecArray | null;
    while ((rMatch = rRegex.exec(pXml)) !== null) {
      const rXml = rMatch[1];
      const rPrMatch = /<w:rPr\b[^>]*>([\s\S]*?)<\/w:rPr>/.exec(rXml);
      const rPr = rPrMatch?.[1] ?? '';

      const bold = /<w:b\b(?![^>]*w:val="(?:0|false)")/.test(rPr);
      const italic = /<w:i\b(?![^>]*w:val="(?:0|false)")/.test(rPr);
      const underline = /<w:u\b(?![^>]*w:val="(?:none|0|false)")/.test(rPr);
      const colorMatch = /<w:color\b[^>]*w:val="([0-9a-fA-F]{6})"/.exec(rPr);

      const parts: string[] = [];
      const childRegex =
        /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(tab|br|cr)\b[^>]*\/>/g;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = childRegex.exec(rXml)) !== null) {
        if (cMatch[1] !== undefined) {
          parts.push(decodeXmlEntities(cMatch[1]));
        } else if (cMatch[2] === 'tab') {
          parts.push('\t');
        } else {
          parts.push('\n');
        }
      }
      const text = parts.join('');
      if (!text) continue;

      runs.push({
        text,
        ...(bold ? { bold: true } : {}),
        ...(italic ? { italic: true } : {}),
        ...(underline ? { underline: true } : {}),
        ...(colorMatch ? { color: parseHexColor(colorMatch[1]) } : {}),
      });
    }

    const fullText = runs
      .map((r) => r.text)
      .join('')
      .trim();
    if (!fullText) {
      return { paragraph: null, headingLevel, isList, embedIds };
    }

    const dir = detectDirection(fullText, hasBidi ? true : undefined);
    const align: MaterialPreviewParagraph['align'] =
      jcVal === 'center'
        ? 'center'
        : jcVal === 'both'
          ? 'justify'
          : jcVal === 'right'
            ? 'right'
            : jcVal === 'left'
              ? 'left'
              : undefined;

    return {
      paragraph: {
        runs,
        dir,
        ...(align ? { align } : {}),
        ...(bulletLevel !== undefined ? { bulletLevel } : {}),
      },
      headingLevel,
      isList,
      embedIds,
    };
  }

  private async parseDocx(buffer: Buffer): Promise<{
    blocks: MaterialPreviewDocBlock[];
    blocksTruncated?: boolean;
  }> {
    let archive: JSZip;
    try {
      archive = await JSZip.loadAsync(buffer, { checkCRC32: true });
    } catch {
      throw new BadRequestException('Invalid Word document');
    }

    const reader = this.createBudgetReader(archive);
    const docXml = await reader.readText('word/document.xml');
    if (!docXml) {
      throw new BadRequestException('Invalid Word document structure');
    }

    const docRels = this.parseRelationships(
      await reader.readText('word/_rels/document.xml.rels'),
      'word/document.xml',
    );
    const mediaCache = new Map<string, string | null>();

    const bodyMatch = /<w:body\b[^>]*>([\s\S]*?)<\/w:body>/.exec(docXml);
    const bodyXml = bodyMatch ? bodyMatch[1] : docXml;

    const blocks: MaterialPreviewDocBlock[] = [];
    let blocksTruncated = false;

    let pos = 0;
    while (pos < bodyXml.length) {
      const nextP = bodyXml.indexOf('<w:p', pos);
      const nextTbl = bodyXml.indexOf('<w:tbl', pos);
      if (nextP === -1 && nextTbl === -1) break;

      if (blocks.length >= MAX_PREVIEW_DOC_BLOCKS) {
        blocksTruncated = true;
        break;
      }

      if (nextTbl !== -1 && (nextP === -1 || nextTbl < nextP)) {
        // Parse <w:tbl> with balanced nesting support
        const endTbl = this.findBalancedClosingTag(bodyXml, nextTbl, 'w:tbl');
        if (endTbl === -1) break;
        const tblXml = bodyXml.slice(nextTbl, endTbl);
        pos = endTbl;

        const rows: string[][] = [];
        const trRegex = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g;
        let trMatch: RegExpExecArray | null;
        while ((trMatch = trRegex.exec(tblXml)) !== null) {
          const cells: string[] = [];
          const tcRegex = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g;
          let tcMatch: RegExpExecArray | null;
          while ((tcMatch = tcRegex.exec(trMatch[1])) !== null) {
            const cellLines: string[] = [];
            const cellPRegex = /<w:p(?:\s|>|\/>)([\s\S]*?)<\/w:p>/g;
            let cpMatch: RegExpExecArray | null;
            while ((cpMatch = cellPRegex.exec(tcMatch[1])) !== null) {
              const parsed = this.parseWordParagraph(cpMatch[0]);
              if (parsed.paragraph) {
                cellLines.push(
                  parsed.paragraph.runs
                    .map((r) => r.text)
                    .join('')
                    .trim(),
                );
              }
            }
            cells.push(cellLines.filter(Boolean).join('\n'));
          }
          if (cells.some(Boolean)) rows.push(cells);
        }
        if (rows.length > 0) {
          const sample = rows.flat().join(' ');
          blocks.push({
            kind: 'table',
            rows,
            dir: detectDirection(sample),
          });
        }
      } else {
        // Check self-closing <w:p/> vs <w:p ...>...</w:p>
        const tagClose = bodyXml.indexOf('>', nextP);
        if (tagClose === -1) break;
        const afterName = bodyXml[nextP + 4];
        if (
          afterName !== '>' &&
          afterName !== '/' &&
          afterName !== ' ' &&
          afterName !== '\t' &&
          afterName !== '\r' &&
          afterName !== '\n'
        ) {
          // e.g. <w:pPr> or <w:proofErr>
          pos = tagClose + 1;
          continue;
        }
        if (bodyXml[tagClose - 1] === '/') {
          pos = tagClose + 1;
          continue;
        }
        const endP = bodyXml.indexOf('</w:p>', tagClose);
        if (endP === -1) break;
        const pXml = bodyXml.slice(nextP, endP + 6);
        pos = endP + 6;

        const { paragraph, headingLevel, isList, embedIds } =
          this.parseWordParagraph(pXml);

        if (paragraph) {
          if (headingLevel) {
            blocks.push({ kind: 'heading', level: headingLevel, paragraph });
          } else if (isList) {
            blocks.push({ kind: 'list-item', paragraph });
          } else {
            blocks.push({ kind: 'paragraph', paragraph });
          }
        }

        for (const rId of embedIds) {
          const mediaPath = docRels.get(rId);
          if (!mediaPath) continue;
          if (!mediaCache.has(mediaPath)) {
            mediaCache.set(mediaPath, await reader.readImageDataUrl(mediaPath));
          }
          const dataUrl = mediaCache.get(mediaPath);
          if (dataUrl && blocks.length < MAX_PREVIEW_DOC_BLOCKS) {
            blocks.push({ kind: 'image', dataUrl });
          }
        }
      }
    }

    return {
      blocks,
      ...(blocksTruncated ? { blocksTruncated: true } : {}),
    };
  }

  private findBalancedClosingTag(
    xml: string,
    startIdx: number,
    tagName: string,
  ): number {
    const openToken = `<${tagName}`;
    const closeToken = `</${tagName}>`;
    let depth = 0;
    let cursor = startIdx;
    while (cursor < xml.length) {
      const nextOpen = xml.indexOf(openToken, cursor);
      const nextClose = xml.indexOf(closeToken, cursor);
      if (nextClose === -1) return -1;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        const after = xml[nextOpen + openToken.length];
        if (
          after === '>' ||
          after === ' ' ||
          after === '\t' ||
          after === '\r' ||
          after === '\n'
        ) {
          depth++;
        }
        cursor = nextOpen + openToken.length;
      } else {
        depth--;
        cursor = nextClose + closeToken.length;
        if (depth <= 0) return cursor;
      }
    }
    return -1;
  }

  private formatExcelCellValue(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Date) {
      return value.toISOString().split('T')[0] ?? '';
    }
    if (typeof value === 'object') {
      if ('richText' in value && Array.isArray(value.richText)) {
        return value.richText.map((part) => part.text).join('');
      }
      if ('text' in value && typeof value.text === 'string') {
        return value.text;
      }
      if ('result' in value && value.result !== undefined) {
        if (
          typeof value.result === 'object' &&
          value.result &&
          'error' in value.result
        ) {
          return String(value.result.error);
        }
        return this.formatExcelCellValue(value.result);
      }
      if ('error' in value) {
        return String(value.error);
      }
    }
    return '';
  }

  private async parseXlsx(buffer: Buffer): Promise<MaterialPreviewSheet[]> {
    const workbook = new ExcelJS.Workbook();
    try {
      const arrayBuf = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
      await workbook.xlsx.load(arrayBuf);
    } catch {
      throw new BadRequestException('Invalid Excel workbook');
    }

    const sheets: MaterialPreviewSheet[] = [];
    for (const worksheet of workbook.worksheets.slice(0, 15)) {
      const totalRows = worksheet.rowCount;
      const totalColumns = worksheet.columnCount;
      const maxCols = Math.min(Math.max(totalColumns, 1), MAX_SHEET_COLS);
      const rows: string[][] = [];
      let populatedCols = 0;

      const limitRow = Math.min(totalRows, MAX_SHEET_ROWS);
      for (let r = 1; r <= limitRow; r++) {
        const row = worksheet.getRow(r);
        if (!row.hasValues) continue;
        const cells: string[] = [];
        let lastNonEmpty = -1;
        for (let c = 1; c <= maxCols; c++) {
          const text = this.formatExcelCellValue(row.getCell(c).value).trim();
          cells.push(text);
          if (text) lastNonEmpty = c;
        }
        if (lastNonEmpty >= 0) {
          populatedCols = Math.max(populatedCols, lastNonEmpty);
          rows.push(cells);
        }
      }

      const trimmedRows =
        populatedCols > 0 ? rows.map((r) => r.slice(0, populatedCols)) : [];

      sheets.push({
        name: worksheet.name || `Sheet ${sheets.length + 1}`,
        rows: trimmedRows,
        totalRows: rows.length,
        totalColumns: populatedCols,
        ...(totalRows > MAX_SHEET_ROWS || totalColumns > MAX_SHEET_COLS
          ? { truncated: true }
          : {}),
      });
    }

    return sheets;
  }

  private parseCsv(buffer: Buffer, fileName: string): MaterialPreviewSheet {
    const encoding =
      buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe
        ? 'utf-16le'
        : buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff
          ? 'utf-16be'
          : 'utf-8';
    const content = new TextDecoder(encoding)
      .decode(buffer)
      .replace(/^\uFEFF/, '');

    const allRows: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (inQuotes) {
        if (ch === '"') {
          if (content[i + 1] === '"') {
            currentField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && content[i + 1] === '\n') i++;
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some(Boolean)) {
          allRows.push(currentRow);
        }
        currentRow = [];
      } else {
        currentField += ch;
      }
    }
    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(Boolean)) {
        allRows.push(currentRow);
      }
    }

    const totalRows = allRows.length;
    const totalColumns = allRows.reduce(
      (max, row) => Math.max(max, row.length),
      0,
    );
    const colCap = Math.min(totalColumns, MAX_SHEET_COLS);
    const sliced = allRows
      .slice(0, MAX_SHEET_ROWS)
      .map((row) => Array.from({ length: colCap }, (_, idx) => row[idx] ?? ''));

    return {
      name: fileName.replace(/\.[^/.]+$/, '') || 'CSV',
      rows: sliced,
      totalRows,
      totalColumns,
      ...(totalRows > MAX_SHEET_ROWS || totalColumns > MAX_SHEET_COLS
        ? { truncated: true }
        : {}),
    };
  }
}
