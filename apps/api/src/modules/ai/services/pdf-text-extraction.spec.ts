import { ConfigService } from '@nestjs/config';
import { deflateSync } from 'node:zlib';
import { PdfTextExtractionService } from './pdf-text-extraction.service';

function buildSyntheticPdf(options: {
  pageStreams?: string[];
  flate?: boolean;
  encrypted?: boolean;
  imageOnly?: boolean;
}): Buffer {
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'latin1')];
  let objId = 1;

  if (options.encrypted) {
    parts.push(
      Buffer.from(
        `${objId++} 0 obj\n<< /Filter /Standard /V 2 >>\nendobj\n<< /Encrypt 1 0 R >>\n`,
        'latin1',
      ),
    );
  }

  if (options.imageOnly) {
    parts.push(
      Buffer.from(
        `${objId++} 0 obj\n<< /Type /Page /Contents 3 0 R >>\nendobj\n` +
          `${objId++} 0 obj\n<< /Subtype /Image /Width 100 /Height 100 >>\nstream\nBINARYIMAGE\nendstream\nendobj\n`,
        'latin1',
      ),
    );
  }

  for (const content of options.pageStreams ?? []) {
    const pageObjId = objId++;
    const contentObjId = objId++;
    parts.push(
      Buffer.from(
        `${pageObjId} 0 obj\n<< /Type /Page /Contents ${contentObjId} 0 R >>\nendobj\n`,
        'latin1',
      ),
    );

    if (options.flate) {
      const compressed = deflateSync(Buffer.from(content, 'latin1'));
      parts.push(
        Buffer.from(
          `${contentObjId} 0 obj\n<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
          'latin1',
        ),
        compressed,
        Buffer.from('\nendstream\nendobj\n', 'latin1'),
      );
    } else {
      parts.push(
        Buffer.from(
          `${contentObjId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
          'latin1',
        ),
      );
    }
  }

  parts.push(Buffer.from('%%EOF\n', 'latin1'));
  return Buffer.concat(parts);
}

describe('PdfTextExtractionService', () => {
  const service = new PdfTextExtractionService();

  it('extracts page-level text from multi-page uncompressed and FlateDecode PDFs', async () => {
    const pdf = buildSyntheticPdf({
      flate: true,
      pageStreams: [
        'BT (Course Syllabus: Management Information Systems) Tj T* (Prerequisites: BIS101 and ACC102) Tj ET',
        'BT [(Midterm Exam: 20 Marks) -200 (Final Exam: 60 Marks)] TJ ET',
      ],
    });

    const res = await service.extractFromBuffer(pdf);
    expect(res.ok).toBe(true);
    expect(res.pageCount).toBe(2);
    expect(res.pages).toHaveLength(2);
    expect(res.pages[0]).toEqual({
      pageNumber: 1,
      text: expect.stringContaining('Management Information Systems'),
    });
    expect(res.pages[1]).toEqual({
      pageNumber: 2,
      text: expect.stringContaining('Midterm Exam: 20 Marks'),
    });
  });

  it('rejects corrupted or non-PDF buffers with CORRUPT_PDF', async () => {
    const corrupt = Buffer.from('NOT_A_PDF_HEADER_DATA');
    const res = await service.extractFromBuffer(corrupt);
    expect(res.ok).toBe(false);
    expect(res.failureCode).toBe('CORRUPT_PDF');
  });

  it('rejects password-protected / encrypted PDFs with ENCRYPTED_PDF', async () => {
    const encrypted = buildSyntheticPdf({
      encrypted: true,
      pageStreams: ['BT (Secret content) Tj ET'],
    });
    const res = await service.extractFromBuffer(encrypted);
    expect(res.ok).toBe(false);
    expect(res.failureCode).toBe('ENCRYPTED_PDF');
  });

  it('detects scanned image-only PDFs with SCANNED_PDF_NO_TEXT and supports P2 OCR fallback when enabled', async () => {
    const scanned = buildSyntheticPdf({ imageOnly: true });
    const withoutOcr = await service.extractFromBuffer(scanned);
    expect(withoutOcr.ok).toBe(false);
    expect(withoutOcr.failureCode).toBe('SCANNED_PDF_NO_TEXT');

    const geminiMock = {
      extractTextFromPdfBuffer: jest
        .fn()
        .mockResolvedValue(
          '=== PAGE 1 ===\nExtracted Arabic & English syllabus via OCR fallback.',
        ),
    };
    const withOcrService = new PdfTextExtractionService(
      new ConfigService({ RAG_OCR_ENABLED: 'true' }),
      geminiMock as never,
    );
    const withOcr = await withOcrService.extractFromBuffer(scanned);
    expect(withOcr.ok).toBe(true);
    expect(withOcr.ocrUsed).toBe(true);
    expect(withOcr.pages[0].pageNumber).toBe(1);
    expect(withOcr.pages[0].text).toContain('OCR fallback');
  });
});
