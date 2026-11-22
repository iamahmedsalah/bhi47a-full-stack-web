import { faqTerms, normalizeFaqText } from '../../faqs/faq-retrieval';

export interface RagPageText {
  pageNumber: number;
  text: string;
}

export interface RagChunkConfig {
  targetChars?: number;
  maxChars?: number;
  minChars?: number;
  overlapChars?: number;
}

export interface GeneratedRagChunk {
  pageNumber: number;
  chunkIndex: number;
  text: string;
  normalizedText: string;
  terms: string[];
  tokenEstimate: number;
}

const DEFAULT_CHUNK_CONFIG: Required<RagChunkConfig> = {
  targetChars: 850,
  maxChars: 1200,
  minChars: 40,
  overlapChars: 140,
};

function cleanPageWhitespace(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitIntoSentenceUnits(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) {
    return [paragraph];
  }

  const rawSentences = paragraph
    .split(/(?<=[.!?؟؛\n])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);

  const units: string[] = [];
  for (const sentence of rawSentences) {
    if (sentence.length <= maxChars) {
      units.push(sentence);
      continue;
    }
    // Hard word-boundary split for abnormally long unpunctuated lines
    const words = sentence.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (!current) {
        current = word.slice(0, maxChars);
      } else if (current.length + 1 + word.length <= maxChars) {
        current = `${current} ${word}`;
      } else {
        units.push(current);
        current = word.slice(0, maxChars);
      }
    }
    if (current) {
      units.push(current);
    }
  }

  return units.length > 0 ? units : [paragraph.slice(0, maxChars)];
}

function computeOverlapTail(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length <= overlapChars) {
    return '';
  }
  const tailSlice = text.slice(-overlapChars);
  const firstWordBoundary = tailSlice.search(/\s+/);
  return firstWordBoundary >= 0
    ? tailSlice.slice(firstWordBoundary).trim()
    : tailSlice.trim();
}

export function chunkDocumentPages(
  pages: RagPageText[],
  config?: RagChunkConfig,
): GeneratedRagChunk[] {
  const opts: Required<RagChunkConfig> = {
    ...DEFAULT_CHUNK_CONFIG,
    ...config,
  };

  const results: GeneratedRagChunk[] = [];
  const seenNormalized = new Set<string>();
  let chunkIndex = 0;

  for (const page of pages) {
    if (!page || page.pageNumber < 1) continue;
    const cleaned = cleanPageWhitespace(page.text || '');
    if (!cleaned) continue;

    const paragraphs = cleaned
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const units = paragraphs.flatMap((p) =>
      splitIntoSentenceUnits(p, opts.maxChars),
    );

    const pageBuffers: string[] = [];
    let buffer = '';

    for (const unit of units) {
      if (!buffer) {
        buffer = unit;
        continue;
      }

      const candidate = `${buffer}\n${unit}`;
      if (candidate.length <= opts.targetChars) {
        buffer = candidate;
      } else {
        pageBuffers.push(buffer);
        const overlap = computeOverlapTail(buffer, opts.overlapChars);
        const nextWithOverlap = overlap ? `${overlap}\n${unit}` : unit;
        buffer =
          nextWithOverlap.length <= opts.maxChars ? nextWithOverlap : unit;
      }
    }

    if (buffer) {
      // If trailing buffer is tiny and there is a previous chunk on the same page, merge if within maxChars
      if (
        buffer.length < opts.minChars &&
        pageBuffers.length > 0 &&
        pageBuffers[pageBuffers.length - 1].length + 1 + buffer.length <=
          opts.maxChars
      ) {
        pageBuffers[pageBuffers.length - 1] =
          `${pageBuffers[pageBuffers.length - 1]}\n${buffer}`;
      } else {
        pageBuffers.push(buffer);
      }
    }

    for (const rawChunk of pageBuffers) {
      const trimmed = rawChunk.trim();
      const normalizedText = normalizeFaqText(trimmed);
      if (
        trimmed.length < Math.min(opts.minChars, cleaned.length) ||
        !normalizedText
      ) {
        continue;
      }
      const dedupeKey = `${page.pageNumber}:${normalizedText}`;
      if (seenNormalized.has(dedupeKey)) {
        continue;
      }
      seenNormalized.add(dedupeKey);

      results.push({
        pageNumber: page.pageNumber,
        chunkIndex,
        text: trimmed,
        normalizedText,
        terms: extractChunkTerms(trimmed),
        tokenEstimate: Math.max(1, Math.ceil(trimmed.length / 4)),
      });
      chunkIndex += 1;
    }
  }

  return results;
}

export function extractChunkTerms(text: string): string[] {
  const normalized = normalizeFaqText(text);
  if (!normalized) return [];
  const words = normalized.split(' ').filter((w) => w.length >= 2);
  // Keep up to 80 distinct terms per chunk for fast hybrid lexical matching
  const priorityTerms = faqTerms(text);
  return [...new Set([...priorityTerms, ...words])].slice(0, 80);
}
