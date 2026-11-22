import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, stat } from 'node:fs/promises';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { COURSE_BOOK_MAX_BYTES } from '@student-portal/shared';
import type { RagDocumentFailureCode } from '../schemas/rag-document.schema';
import type { RagPageText } from './rag-chunking';
import { GeminiProvider } from '../providers/gemini.provider';

export interface PdfExtractionResult {
  ok: boolean;
  pages: RagPageText[];
  pageCount: number;
  ocrUsed: boolean;
  failureCode?: RagDocumentFailureCode;
}

const MAX_DECOMPRESSED_STREAM_BYTES = 16 * 1024 * 1024; // 16 MB bomb guard per stream
const MIN_TOTAL_EXTRACTED_CHARS = 12;

@Injectable()
export class PdfTextExtractionService {
  constructor(
    private readonly config?: ConfigService,
    private readonly gemini?: GeminiProvider,
  ) {}

  async extractFromFile(filePath: string): Promise<PdfExtractionResult> {
    try {
      const info = await stat(filePath);
      if (!info.isFile() || info.size === 0) {
        return {
          ok: false,
          pages: [],
          pageCount: 0,
          ocrUsed: false,
          failureCode: 'EMPTY_PDF',
        };
      }
      if (info.size > COURSE_BOOK_MAX_BYTES) {
        return {
          ok: false,
          pages: [],
          pageCount: 0,
          ocrUsed: false,
          failureCode: 'CORRUPT_PDF',
        };
      }
      const buffer = await readFile(filePath);
      return this.extractFromBuffer(buffer);
    } catch {
      return {
        ok: false,
        pages: [],
        pageCount: 0,
        ocrUsed: false,
        failureCode: 'STORAGE_READ_FAILED',
      };
    }
  }

  async extractFromBuffer(buffer: Buffer): Promise<PdfExtractionResult> {
    if (!buffer || buffer.length === 0) {
      return {
        ok: false,
        pages: [],
        pageCount: 0,
        ocrUsed: false,
        failureCode: 'EMPTY_PDF',
      };
    }

    if (
      buffer.length < 16 ||
      buffer.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      return {
        ok: false,
        pages: [],
        pageCount: 0,
        ocrUsed: false,
        failureCode: 'CORRUPT_PDF',
      };
    }

    const latin = buffer.toString('latin1');
    if (!latin.includes('%%EOF')) {
      return {
        ok: false,
        pages: [],
        pageCount: 0,
        ocrUsed: false,
        failureCode: 'CORRUPT_PDF',
      };
    }

    // Reject password-protected / encrypted PDFs deterministically
    if (/\/Encrypt\b/.test(latin)) {
      return {
        ok: false,
        pages: [],
        pageCount: 0,
        ocrUsed: false,
        failureCode: 'ENCRYPTED_PDF',
      };
    }

    const objects = this.parsePdfObjects(buffer, latin);
    if (objects.size === 0) {
      return {
        ok: false,
        pages: [],
        pageCount: 0,
        ocrUsed: false,
        failureCode: 'CORRUPT_PDF',
      };
    }

    const cmapTable = this.extractGlobalToUnicodeMap(objects);
    const pageContentStreams = this.collectPageStreams(objects);

    if (pageContentStreams.length === 0) {
      return {
        ok: false,
        pages: [],
        pageCount: 0,
        ocrUsed: false,
        failureCode: 'EMPTY_PDF',
      };
    }

    const pages: RagPageText[] = [];
    let totalChars = 0;

    for (let idx = 0; idx < pageContentStreams.length; idx++) {
      const rawStreams = pageContentStreams[idx];
      const pageLines: string[] = [];
      for (const streamText of rawStreams) {
        const extracted = this.extractTextFromContentStream(
          streamText,
          cmapTable,
        );
        if (extracted) {
          pageLines.push(extracted);
        }
      }
      const pageText = pageLines.join('\n').trim();
      totalChars += pageText.length;
      if (pageText) {
        pages.push({
          pageNumber: idx + 1,
          text: pageText,
        });
      }
    }

    if (totalChars >= MIN_TOTAL_EXTRACTED_CHARS && pages.length > 0) {
      return {
        ok: true,
        pages,
        pageCount: pageContentStreams.length,
        ocrUsed: false,
      };
    }

    const hasImages = /\/Subtype\s*\/Image\b/.test(latin);

    // P2: Optional OCR fallback via Gemini multimodal when RAG_OCR_ENABLED=true
    const ocrEnabled =
      this.config?.get<string>('RAG_OCR_ENABLED') === 'true' &&
      Boolean(this.gemini);

    if (ocrEnabled && this.gemini) {
      try {
        const ocrText = await this.gemini.extractTextFromPdfBuffer(buffer);
        const ocrPages = this.parseOcrPages(
          ocrText,
          pageContentStreams.length || 1,
        );
        const ocrChars = ocrPages.reduce((sum, p) => sum + p.text.length, 0);
        if (ocrChars >= MIN_TOTAL_EXTRACTED_CHARS) {
          return {
            ok: true,
            pages: ocrPages,
            pageCount: Math.max(pageContentStreams.length, ocrPages.length),
            ocrUsed: true,
          };
        }
      } catch {
        // Fall through to deterministic failureCode below
      }
    }

    return {
      ok: false,
      pages: [],
      pageCount: pageContentStreams.length,
      ocrUsed: false,
      failureCode: hasImages ? 'SCANNED_PDF_NO_TEXT' : 'EMPTY_PDF',
    };
  }

  private parsePdfObjects(
    buffer: Buffer,
    latin: string,
  ): Map<number, { dict: string; streamText?: string }> {
    const map = new Map<number, { dict: string; streamText?: string }>();
    const objRegex = /(\d+)\s+\d+\s+obj\b([\s\S]*?)endobj\b/g;
    let match: RegExpExecArray | null;

    while ((match = objRegex.exec(latin)) !== null) {
      const objId = Number(match[1]);
      const body = match[2];
      const streamMarkerIdx = body.indexOf('stream');

      if (streamMarkerIdx === -1) {
        map.set(objId, { dict: body });
        continue;
      }

      const dict = body.slice(0, streamMarkerIdx);
      const bodyStartInBuffer =
        match.index + match[0].indexOf(body) + streamMarkerIdx;

      // Skip "stream" followed by \r\n or \n
      let streamStart = bodyStartInBuffer + 6;
      if (buffer[streamStart] === 0x0d && buffer[streamStart + 1] === 0x0a) {
        streamStart += 2;
      } else if (buffer[streamStart] === 0x0a || buffer[streamStart] === 0x0d) {
        streamStart += 1;
      }

      const endStreamIdx = body.lastIndexOf('endstream');
      if (endStreamIdx === -1) {
        map.set(objId, { dict });
        continue;
      }

      let streamEnd = match.index + match[0].indexOf(body) + endStreamIdx;
      while (
        streamEnd > streamStart &&
        (buffer[streamEnd - 1] === 0x0a || buffer[streamEnd - 1] === 0x0d)
      ) {
        streamEnd -= 1;
      }

      const rawBytes = buffer.subarray(streamStart, streamEnd);
      const streamText = this.decodeStreamBytes(dict, rawBytes);
      map.set(objId, { dict, streamText });
    }

    return map;
  }

  private decodeStreamBytes(
    dict: string,
    rawBytes: Buffer,
  ): string | undefined {
    if (/\/Subtype\s*\/Image\b/.test(dict)) {
      return undefined;
    }

    if (/\/Filter\s*(?:\[\s*)?\/FlateDecode\b/.test(dict)) {
      try {
        const inflated = inflateSync(rawBytes, {
          maxOutputLength: MAX_DECOMPRESSED_STREAM_BYTES,
        });
        return inflated.toString('latin1');
      } catch {
        try {
          const inflatedRaw = inflateRawSync(rawBytes, {
            maxOutputLength: MAX_DECOMPRESSED_STREAM_BYTES,
          });
          return inflatedRaw.toString('latin1');
        } catch {
          return undefined;
        }
      }
    }

    if (rawBytes.length > MAX_DECOMPRESSED_STREAM_BYTES) {
      return undefined;
    }

    return rawBytes.toString('latin1');
  }

  private collectPageStreams(
    objects: Map<number, { dict: string; streamText?: string }>,
  ): string[][] {
    const pages: string[][] = [];

    for (const [, obj] of objects) {
      if (!/\/Type\s*\/Page\b(?!s)/.test(obj.dict)) {
        continue;
      }

      const contentsRefs: number[] = [];
      const arrayMatch = /\/Contents\s*\[([\s\S]*?)\]/.exec(obj.dict);
      if (arrayMatch) {
        const refRegex = /(\d+)\s+\d+\s+R/g;
        let ref: RegExpExecArray | null;
        while ((ref = refRegex.exec(arrayMatch[1])) !== null) {
          contentsRefs.push(Number(ref[1]));
        }
      } else {
        const singleMatch = /\/Contents\s+(\d+)\s+\d+\s+R/.exec(obj.dict);
        if (singleMatch) {
          contentsRefs.push(Number(singleMatch[1]));
        }
      }

      const streams: string[] = [];
      if (obj.streamText) {
        streams.push(obj.streamText);
      }
      for (const refId of contentsRefs) {
        const target = objects.get(refId);
        if (target?.streamText) {
          streams.push(target.streamText);
        }
      }

      pages.push(streams);
    }

    // Fallback: if no explicit /Type /Page object matched, collect any stream with BT..ET text blocks
    if (pages.length === 0) {
      const textStreams: string[] = [];
      for (const [, obj] of objects) {
        if (obj.streamText && /\bBT\b[\s\S]*?\bET\b/.test(obj.streamText)) {
          textStreams.push(obj.streamText);
        }
      }
      if (textStreams.length > 0) {
        pages.push(textStreams);
      }
    }

    return pages;
  }

  private extractGlobalToUnicodeMap(
    objects: Map<number, { dict: string; streamText?: string }>,
  ): Map<number, string> {
    const cmap = new Map<number, string>();

    for (const [, obj] of objects) {
      const text = obj.streamText;
      if (
        !text ||
        (!text.includes('beginbfchar') && !text.includes('beginbfrange'))
      ) {
        continue;
      }

      const bfcharBlocks = text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g);
      for (const block of bfcharBlocks) {
        const pairs = block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
        for (const pair of pairs) {
          const srcCode = parseInt(pair[1], 16);
          const dstStr = this.decodeHexUnicode(pair[2]);
          if (!Number.isNaN(srcCode) && dstStr) {
            cmap.set(srcCode, dstStr);
          }
        }
      }

      const bfrangeBlocks = text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g);
      for (const block of bfrangeBlocks) {
        const ranges = block[1].matchAll(
          /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
        );
        for (const range of ranges) {
          const start = parseInt(range[1], 16);
          const end = parseInt(range[2], 16);
          const targetStart = parseInt(range[3], 16);
          if (
            !Number.isNaN(start) &&
            !Number.isNaN(end) &&
            !Number.isNaN(targetStart) &&
            end >= start &&
            end - start <= 1024
          ) {
            for (let code = start; code <= end; code++) {
              cmap.set(
                code,
                String.fromCodePoint(targetStart + (code - start)),
              );
            }
          }
        }
      }
    }

    return cmap;
  }

  private extractTextFromContentStream(
    streamText: string,
    cmap: Map<number, string>,
  ): string {
    const blocks = [...streamText.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)];
    const sourceSegments =
      blocks.length > 0 ? blocks.map((b) => b[1]) : [streamText];

    const lines: string[] = [];

    for (const segment of sourceSegments) {
      const tokens: string[] = [];
      const operatorRegex =
        /\[((?:[^\]\\]|\\.|\[[^\]]*\])*)\]\s*TJ|\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|<([0-9A-Fa-f\s]+)>\s*Tj|\b(T\*|TD|Td)\b/g;

      let op: RegExpExecArray | null;
      while ((op = operatorRegex.exec(segment)) !== null) {
        if (op[1] !== undefined) {
          // TJ array
          const arrayBody = op[1];
          const innerRegex =
            /\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]+)>|(-?\d+(?:\.\d+)?)/g;
          let item: RegExpExecArray | null;
          let piece = '';
          while ((item = innerRegex.exec(arrayBody)) !== null) {
            if (item[1] !== undefined) {
              piece += this.decodePdfLiteralString(item[1], cmap);
            } else if (item[2] !== undefined) {
              piece += this.decodePdfHexString(item[2], cmap);
            } else if (item[3] !== undefined && Number(item[3]) < -120) {
              piece += ' ';
            }
          }
          if (piece) tokens.push(piece);
        } else if (op[2] !== undefined) {
          tokens.push(this.decodePdfLiteralString(op[2], cmap));
        } else if (op[3] !== undefined) {
          tokens.push(this.decodePdfHexString(op[3], cmap));
        } else if (op[4] !== undefined) {
          tokens.push('\n');
        }
      }

      const joined = tokens
        .join(' ')
        .replace(/ *\n */g, '\n')
        .replace(/ {2,}/g, ' ')
        .trim();

      if (joined) {
        lines.push(joined);
      }
    }

    return lines.join('\n').trim();
  }

  private decodePdfLiteralString(
    raw: string,
    cmap: Map<number, string>,
  ): string {
    const unescaped = raw
      .replace(/\\([0-7]{1,3})/g, (_, oct: string) =>
        String.fromCharCode(parseInt(oct, 8)),
      )
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');

    const bytes = Buffer.from(unescaped, 'latin1');
    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return this.decodeUtf16Be(bytes.subarray(2));
    }

    // Decode as UTF-8 if valid multibyte UTF-8 (e.g., Arabic text directly encoded)
    const utf8 = bytes.toString('utf8');
    if (!utf8.includes('\uFFFD')) {
      return utf8;
    }

    if (cmap.size > 0) {
      let mapped = '';
      for (const byte of bytes) {
        mapped += cmap.get(byte) ?? String.fromCharCode(byte);
      }
      return mapped;
    }

    return unescaped;
  }

  private decodePdfHexString(
    hexRaw: string,
    cmap: Map<number, string>,
  ): string {
    const cleanHex = hexRaw.replace(/\s+/g, '');
    if (!cleanHex) return '';
    const padded = cleanHex.length % 2 === 1 ? `${cleanHex}0` : cleanHex;
    const bytes = Buffer.from(padded, 'hex');

    if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      return this.decodeUtf16Be(bytes.subarray(2));
    }

    if (cmap.size > 0) {
      if (bytes.length % 2 === 0) {
        let mapped16 = '';
        let hit16 = false;
        for (let i = 0; i < bytes.length; i += 2) {
          const code16 = bytes.readUInt16BE(i);
          if (cmap.has(code16)) {
            hit16 = true;
            mapped16 += cmap.get(code16);
          } else {
            mapped16 += String.fromCharCode(code16);
          }
        }
        if (hit16) return mapped16;
      }

      let mapped8 = '';
      for (const b of bytes) {
        mapped8 += cmap.get(b) ?? String.fromCharCode(b);
      }
      return mapped8;
    }

    return this.decodeHexUnicode(padded);
  }

  private decodeHexUnicode(hex: string): string {
    const bytes = Buffer.from(hex, 'hex');
    if (bytes.length >= 2 && bytes.length % 2 === 0) {
      return this.decodeUtf16Be(bytes);
    }
    return bytes.toString('utf8');
  }

  private decodeUtf16Be(bytes: Buffer): string {
    let out = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode(bytes.readUInt16BE(i));
    }
    return out;
  }

  private parseOcrPages(
    ocrText: string,
    fallbackPageCount: number,
  ): RagPageText[] {
    const clean = ocrText.trim();
    if (!clean) return [];

    const matches = [
      ...clean.matchAll(
        /===\s*PAGE\s+(\d+)\s*===\s*([\s\S]*?)(?====\s*PAGE\s+\d+\s*===|$)/gi,
      ),
    ];

    if (matches.length > 0) {
      return matches
        .map((m) => ({
          pageNumber: Math.max(1, Number(m[1]) || 1),
          text: m[2].trim(),
        }))
        .filter((p) => Boolean(p.text));
    }

    return [
      {
        pageNumber: Math.min(1, fallbackPageCount),
        text: clean,
      },
    ];
  }
}
