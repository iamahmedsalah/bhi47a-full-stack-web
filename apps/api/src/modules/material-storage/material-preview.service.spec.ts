import JSZip from 'jszip';
import * as ExcelJS from 'exceljs';
import { MaterialPreviewService } from './material-preview.service';

describe('MaterialPreviewService', () => {
  const service = new MaterialPreviewService();
  const samplePng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e221bc330000000049454e44ae426082',
    'hex',
  );

  async function buildSyntheticPptx(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    );
    zip.file(
      'ppt/presentation.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:sldIdLst>
          <p:sldId id="256" r:id="rId1"/>
        </p:sldIdLst>
        <p:sldSz cx="12192000" cy="6858000"/>
      </p:presentation>`,
    );
    zip.file(
      'ppt/_rels/presentation.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="slide" Target="slides/slide1.xml"/>
      </Relationships>`,
    );
    zip.file(
      'ppt/slideLayouts/slideLayout1.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
            <p:spPr><a:xfrm><a:off x="609600" y="365760"/><a:ext cx="10972800" cy="1097280"/></a:xfrm></p:spPr>
          </p:sp>
        </p:spTree></p:cSld>
      </p:sldLayout>`,
    );
    zip.file('ppt/media/image1.png', samplePng);
    zip.file(
      'ppt/notesSlides/notesSlide1.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <p:cSld><p:spTree>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
            <p:txBody><a:p><a:r><a:t>ملاحظات السكشن التاسع</a:t></a:r></a:p></p:txBody>
          </p:sp>
        </p:spTree></p:cSld>
      </p:notes>`,
    );
    zip.file(
      'ppt/slides/_rels/slide1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rIdLayout" Type="slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
        <Relationship Id="rIdImg1" Type="image" Target="../media/image1.png"/>
        <Relationship Id="rIdNotes1" Type="notesSlide" Target="../notesSlides/notesSlide1.xml"/>
      </Relationships>`,
    );
    zip.file(
      'ppt/slides/slide1.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <p:cSld><p:spTree>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr>
            <p:spPr/>
            <p:txBody>
              <a:p><a:pPr rtl="1" algn="ctr"/><a:r><a:rPr b="1" sz="3200"/><a:t>سكشن الوراثة الجزء الثاني</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
          <p:sp>
            <p:nvSpPr><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr>
            <p:spPr><a:xfrm><a:off x="609600" y="1828800"/><a:ext cx="6096000" cy="3657600"/></a:xfrm></p:spPr>
            <p:txBody>
              <a:p><a:pPr rtl="1" lvl="0"><a:buChar char="•"/></a:pPr><a:r><a:t>مفهوم تعدد الأشكال Polymorphism</a:t></a:r></a:p>
            </p:txBody>
          </p:sp>
          <p:pic>
            <p:nvPicPr><p:cNvPr id="4" name="Diagram" descr="Class Diagram"/></p:nvPicPr>
            <p:blipFill><a:blip r:embed="rIdImg1"/></p:blipFill>
            <p:spPr><a:xfrm><a:off x="7315200" y="1828800"/><a:ext cx="4267200" cy="3657600"/></a:xfrm></p:spPr>
          </p:pic>
        </p:spTree></p:cSld>
      </p:sld>`,
    );
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  async function buildSyntheticDocx(): Promise<Buffer> {
    const zip = new JSZip();
    zip.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>',
    );
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p>
            <w:pPr><w:pStyle w:val="Heading1"/><w:bidi/></w:pPr>
            <w:r><w:rPr><w:b/></w:rPr><w:t>ملخص المحاضرة التاسعة</w:t></w:r>
          </w:p>
          <w:tbl>
            <w:tr>
              <w:tc><w:p><w:r><w:t>المصطلح</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>التعريف</w:t></w:r></w:p></w:tc>
            </w:tr>
            <w:tr>
              <w:tc><w:p><w:r><w:t>Inheritance</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:t>وراثة الخصائص والدوال</w:t></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>`,
    );
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  it('extracts slides, layout placeholder coordinates, RTL text, images, and speaker notes from PPTX', async () => {
    const pptxBuffer = await buildSyntheticPptx();
    const preview = await service.buildPreview({
      materialId: 'm1',
      title: 'سكشن الوراثة الجزء الثاني',
      fileName: 'inheritance-part2.pptx',
      buffer: pptxBuffer,
    });

    expect(preview.kind).toBe('pptx');
    expect(preview.totalSlides).toBe(1);
    expect(preview.slideAspectRatio).toBeCloseTo(16 / 9, 2);
    expect(preview.slides?.[0].title).toBe('سكشن الوراثة الجزء الثاني');
    expect(preview.slides?.[0].notes).toBe('ملاحظات السكشن التاسع');
    expect(preview.slides?.[0].elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'text',
          isPlaceholderTitle: true,
          x: 5,
        }),
        expect.objectContaining({
          kind: 'image',
          alt: 'Class Diagram',
          dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
        }),
      ]),
    );
  });

  it('extracts headings and tables from DOCX', async () => {
    const docxBuffer = await buildSyntheticDocx();
    const preview = await service.buildPreview({
      materialId: 'm2',
      title: 'ملخص المحاضرة',
      fileName: 'summary.docx',
      buffer: docxBuffer,
    });

    expect(preview.kind).toBe('docx');
    expect(preview.blocks).toEqual([
      expect.objectContaining({
        kind: 'heading',
        level: 1,
      }),
      expect.objectContaining({
        kind: 'table',
        rows: [
          ['المصطلح', 'التعريف'],
          ['Inheritance', 'وراثة الخصائص والدوال'],
        ],
      }),
    ]);
  });

  it('extracts XLSX worksheets and UTF-8 BOM CSV tables', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('الدرجات');
    ws.addRow(['الكود', 'الاسم']);
    ws.addRow(['2026001', 'أحمد محمد']);
    const xlsxBuffer = Buffer.from(await wb.xlsx.writeBuffer());

    const xlsxPreview = await service.buildPreview({
      materialId: 'm3',
      title: 'كشف عملي',
      fileName: 'lab.xlsx',
      buffer: xlsxBuffer,
    });
    expect(xlsxPreview.kind).toBe('spreadsheet');
    expect(xlsxPreview.sheets?.[0]).toMatchObject({
      name: 'الدرجات',
      rows: [
        ['الكود', 'الاسم'],
        ['2026001', 'أحمد محمد'],
      ],
    });

    const csvBuffer = Buffer.from(
      '\uFEFFCode,Topic\nS21,"OOP, Inheritance"',
      'utf8',
    );
    const csvPreview = await service.buildPreview({
      materialId: 'm4',
      title: 'Topics',
      fileName: 'topics.csv',
      buffer: csvBuffer,
    });
    expect(csvPreview.kind).toBe('spreadsheet');
    expect(csvPreview.sheets?.[0].rows).toEqual([
      ['Code', 'Topic'],
      ['S21', 'OOP, Inheritance'],
    ]);
  });

  it('lists ZIP bundle entries, previews nested files, and rejects path traversal', async () => {
    const pptxBuffer = await buildSyntheticPptx();
    const bundle = new JSZip();
    bundle.file('section9.pptx', pptxBuffer);
    bundle.file('notes.pdf', Buffer.from('%PDF-1.7\ncontent'));
    const zipBuffer = await bundle.generateAsync({ type: 'nodebuffer' });

    const rootPreview = await service.buildPreview({
      materialId: 'm5',
      title: 'حزمة السكشن التاسع',
      fileName: 'bundle.zip',
      buffer: zipBuffer,
    });
    expect(rootPreview.kind).toBe('archive');
    expect(rootPreview.entries?.map((e) => e.name)).toEqual([
      'section9.pptx',
      'notes.pdf',
    ]);

    const nestedPreview = await service.buildPreview({
      materialId: 'm5',
      title: 'حزمة السكشن التاسع',
      fileName: 'bundle.zip',
      buffer: zipBuffer,
      entryName: 'section9.pptx',
    });
    expect(nestedPreview.kind).toBe('pptx');
    expect(nestedPreview.entryName).toBe('section9.pptx');
    expect(nestedPreview.slides?.[0].title).toBe('سكشن الوراثة الجزء الثاني');

    await expect(
      service.extractSingleZipEntry(zipBuffer, '../secret.txt'),
    ).rejects.toThrow('Invalid archive entry path');
  });
});
