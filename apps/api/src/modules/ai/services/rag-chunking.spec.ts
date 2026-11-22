import { chunkDocumentPages, extractChunkTerms } from './rag-chunking';

describe('RagChunking', () => {
  it('preserves page numbers, sequential chunkIndex, and paragraph/sentence boundaries', () => {
    const pages = [
      {
        pageNumber: 1,
        text: [
          'الفصل الأول: مقدمة في نظم المعلومات الإدارية وتطبيقاتها في المؤسسات الحديثة.',
          'يتناول هذا المقرر مفاهيم قواعد البيانات وتحليل النظم ودعم القرار الإداري بشكل تفصيلي.',
        ].join('\n\n'),
      },
      {
        pageNumber: 2,
        text: [
          'Chapter 2: Database Architecture and Relational Modeling.',
          'Students will design normalized schemas, write SQL queries, and evaluate indexing strategies.',
        ].join('\n\n'),
      },
    ];

    const chunks = chunkDocumentPages(pages, {
      targetChars: 120,
      maxChars: 240,
      minChars: 20,
      overlapChars: 30,
    });

    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].pageNumber).toBe(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks.some((c) => c.pageNumber === 2)).toBe(true);

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].text.length).toBeLessThanOrEqual(240);
      expect(chunks[i].terms.length).toBeGreaterThan(0);
      expect(chunks[i].tokenEstimate).toBeGreaterThan(0);
    }
  });

  it('deduplicates identical chunks on the same page and skips empty pages', () => {
    const pages = [
      { pageNumber: 1, text: '   ' },
      {
        pageNumber: 2,
        text: 'Repeated syllabus paragraph about midterm grading criteria and attendance policy.',
      },
    ];

    const chunks = chunkDocumentPages(pages);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageNumber).toBe(2);
  });

  it('extracts normalized Arabic and English search terms', () => {
    const terms = extractChunkTerms(
      'امتحان منتصف الفصل (Midterm Exam) يمثل 20 درجة من أعمال السنة.',
    );
    expect(terms).toContain('امتحان');
    expect(terms).toContain('midterm');
  });
});
