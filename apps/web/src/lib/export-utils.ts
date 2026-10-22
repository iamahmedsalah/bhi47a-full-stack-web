'use client';

/**
 * Capture an HTMLElement as PNG and trigger download
 */
export async function exportElementToPng(
  element: HTMLElement | null,
  filename = 'chart-export.png',
  backgroundColor?: string,
): Promise<void> {
  if (!element) {
    throw new Error('Target element not found for PNG export');
  }

  const { toPng } = await import('html-to-image');

  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  const resolvedBg = backgroundColor ?? (isDark ? '#0d1117' : '#ffffff');

  const dataUrl = await toPng(element, {
    backgroundColor: resolvedBg,
    quality: 0.98,
    pixelRatio: 2,
    filter: (node) => {
      // Exclude toolbars or buttons with data-no-export
      if (node instanceof HTMLElement && node.dataset.noExport === 'true') {
        return false;
      }
      return true;
    },
  });

  const link = document.createElement('a');
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Capture an HTMLElement and generate a clean landscape PDF report
 */
export async function exportDashboardToPdf(
  element: HTMLElement | null,
  filename = 'institute-analytics-report.pdf',
  reportTitle = 'Higher Institute Analytics Report',
): Promise<void> {
  if (!element) {
    throw new Error('Target element not found for PDF export');
  }

  const [{ toPng }, { jsPDF }] = await Promise.all([
    import('html-to-image'),
    import('jspdf'),
  ]);

  // Render high-res PNG image first
  const imgData = await toPng(element, {
    backgroundColor: '#0d1117',
    quality: 0.95,
    pixelRatio: 1.5,
    filter: (node) => {
      if (node instanceof HTMLElement && node.dataset.noExport === 'true') {
        return false;
      }
      return true;
    },
  });

  // Create A4 Landscape PDF
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 24;

  // Header banner in PDF
  pdf.setFillColor(13, 17, 23);
  pdf.rect(0, 0, pageWidth, pageHeight, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.setTextColor(34, 211, 238); // Cyan
  pdf.text(reportTitle, margin, 28);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(148, 163, 184); // Slate-400
  const generatedAt = `Generated: ${new Date().toLocaleString()}`;
  pdf.text(generatedAt, pageWidth - margin - pdf.getTextWidth(generatedAt), 28);

  // Calculate scaled dimensions to preserve aspect ratio
  const img = new Image();
  img.src = imgData;
  await new Promise((resolve) => {
    img.onload = resolve;
  });

  const contentTop = 40;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - contentTop - margin;

  const widthRatio = availableWidth / img.width;
  const heightRatio = availableHeight / img.height;
  const scale = Math.min(widthRatio, heightRatio);

  const finalWidth = img.width * scale;
  const finalHeight = img.height * scale;
  const xOffset = margin + (availableWidth - finalWidth) / 2;
  const yOffset = contentTop + (availableHeight - finalHeight) / 2;

  pdf.addImage(imgData, 'PNG', xOffset, yOffset, finalWidth, finalHeight);

  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

/**
 * Lightweight, zero-dependency CSV exporter with proper escaping and UTF-8 BOM
 */
export function exportMetricsToCsv(
  data: Record<string, unknown>[],
  filename = 'institute-metrics.csv',
  columns?: { key: string; header: string }[],
): void {
  if (!data || data.length === 0) {
    throw new Error('No data available to export');
  }

  const effectiveColumns =
    columns ||
    Object.keys(data[0]).map((key) => ({
      key,
      header: key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()),
    }));

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '""';
    const stringVal = String(val);
    if (stringVal.includes('"') || stringVal.includes(',') || stringVal.includes('\n') || stringVal.includes('\r')) {
      return `"${stringVal.replace(/"/g, '""')}"`;
    }
    return `"${stringVal}"`;
  };

  const headerRow = effectiveColumns.map((col) => escapeCell(col.header)).join(',');
  const dataRows = data.map((row) =>
    effectiveColumns.map((col) => escapeCell(row[col.key])).join(','),
  );

  const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: (string | number)[][];
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Downloads a multi-sheet styled Excel workbook (.xls)
 */
export function exportMultiSheetExcel(
  sheets: ExcelSheet[],
  fileName = 'institute-analytics-report.xls',
): void {
  if (typeof window === 'undefined') return;

  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:o="urn:schemas-microsoft-com:office:office"\n';
  xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n';
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n';
  xml += ' xmlns:html="http://www.w3.org/TR/REC-html40">\n';
  xml += ' <Styles>\n';
  xml += '  <Style ss:ID="Default">\n';
  xml += '   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>\n';
  xml += '   <Font ss:FontName="Segoe UI" ss:Size="10"/>\n';
  xml += '  </Style>\n';
  xml += '  <Style ss:ID="Header">\n';
  xml += '   <Font ss:FontName="Segoe UI" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>\n';
  xml += '   <Interior ss:Color="#0F766E" ss:Pattern="Solid"/>\n';
  xml += '   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>\n';
  xml += '  </Style>\n';
  xml += ' </Styles>\n';

  sheets.forEach((sheet) => {
    const safeName = sheet.name.replace(/[/\\?*:[\]]/g, '').slice(0, 31) || 'Sheet';
    xml += ` <Worksheet ss:Name="${safeName}">\n`;
    xml += '  <Table>\n';

    // Header row
    xml += '   <Row ss:Height="24">\n';
    sheet.headers.forEach((h) => {
      xml += `    <Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>\n`;
    });
    xml += '   </Row>\n';

    // Data rows
    sheet.rows.forEach((row) => {
      xml += '   <Row ss:Height="20">\n';
      row.forEach((val) => {
        const isNum = typeof val === 'number' && !Number.isNaN(val);
        const type = isNum ? 'Number' : 'String';
        const strVal = val === null || val === undefined ? '' : String(val);
        xml += `    <Cell><Data ss:Type="${type}">${escapeXml(strVal)}</Data></Cell>\n`;
      });
      xml += '   </Row>\n';
    });

    xml += '  </Table>\n';
    xml += ' </Worksheet>\n';
  });

  xml += '</Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName.endsWith('.xls') ? fileName : `${fileName}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME_TYPE = 'text/csv; charset=utf-8';

/**
 * Standardized global helper for downloading binary Excel (.xlsx), CSV, or other binary files.
 * Accurately handles Axios response unwrapping (whether the interceptor returned `response.data` or AxiosResponse).
 * Also guards against server error JSON disguised as blob and 0-byte corrupt files.
 */
export async function downloadFileBlob(
  raw: unknown,
  filename: string,
  defaultMimeType: string = EXCEL_MIME_TYPE,
): Promise<void> {
  if (typeof window === 'undefined') return;

  const rawRecord =
    typeof raw === 'object' && raw !== null
      ? (raw as Record<string, unknown>)
      : null;

  let blob: Blob;
  if (raw instanceof Blob) {
    blob = raw;
  } else if (rawRecord && rawRecord.data instanceof Blob) {
    blob = rawRecord.data;
  } else if (rawRecord && rawRecord.data !== undefined) {
    blob = new Blob([rawRecord.data as BlobPart], { type: defaultMimeType });
  } else {
    blob = new Blob([raw as BlobPart], { type: defaultMimeType });
  }

  // Check if server returned an error JSON disguised as blob
  if (blob.type.includes('application/json')) {
    const errorText = await blob.text();
    try {
      const errObj = JSON.parse(errorText) as Record<string, unknown>;
      const msg = typeof errObj.message === 'string' ? errObj.message : '';
      throw new Error(msg || 'فشل تحميل الملف');
    } catch (e: unknown) {
      if (e instanceof Error && e.message !== 'فشل تحميل الملف') throw e;
      throw new Error(errorText || 'فشل تحميل الملف');
    }
  }

  if (blob.size === 0) {
    throw new Error('الملف المستلم فارغ');
  }

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
