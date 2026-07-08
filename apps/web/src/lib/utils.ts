export { cn } from './cn';

/**
 * Cleanly prints a DOM element in a styled iframe/new window with Cairo font
 */
export function printElement(elementId: string, title: string = 'تقرير النظام') {
  if (typeof window === 'undefined') return;
  const element = document.getElementById(elementId);
  if (!element) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const dir = document.documentElement.dir || 'rtl';

  printWindow.document.write(`
    <html dir="${dir}">
      <head>
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
          body {
            font-family: 'Cairo', sans-serif;
            padding: 30px;
            color: #111827;
            background: #ffffff;
          }
          .no-print { display: none !important; }
          .title-section {
            border-bottom: 2px solid #0891b2;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .title-section h1 {
            margin: 0;
            font-size: 22px;
            color: #0891b2;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            font-size: 13px;
          }
          th, td {
            border: 1px solid #e5e7eb;
            padding: 10px;
            text-align: start;
          }
          th {
            background-color: #f9fafb;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <div class="title-section">
          <h1>${title}</h1>
        </div>
        <div>${element.innerHTML}</div>
        <script>
          window.addEventListener('load', () => {
            window.print();
            setTimeout(() => window.close(), 600);
          });
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Downloads a dataset as a styled Excel XML sheet
 */
export function downloadExcel(data: Record<string, unknown>[], headers: string[], fileName: string) {
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
  xml += '  </Style>\n';
  xml += '  <Style ss:ID="Header">\n';
  xml += '   <Font ss:Bold="1" ss:Color="#FFFFFF"/>\n';
  xml += '   <Interior ss:Color="#0891B2" ss:Pattern="Solid"/>\n';
  xml += '  </Style>\n';
  xml += ' </Styles>\n';
  xml += ' <Worksheet ss:Name="Report">\n';
  xml += '  <Table>\n';
  
  // Write Headers
  xml += '   <Row>\n';
  headers.forEach((h) => {
    xml += `    <Cell ss:StyleID="Header"><Data ss:Type="String">${h}</Data></Cell>\n`;
  });
  xml += '   </Row>\n';
  
  // Write Rows
  data.forEach((row) => {
    xml += '   <Row>\n';
    Object.values(row).forEach((val) => {
      const valStr = val === undefined || val === null ? '' : String(val);
      xml += `    <Cell><Data ss:Type="String">${valStr}</Data></Cell>\n`;
    });
    xml += '   </Row>\n';
  });
  
  xml += '  </Table>\n';
  xml += ' </Worksheet>\n';
  xml += '</Workbook>';

  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${fileName}.xls`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Validates file constraints for client-side uploads
 */
export function validateUploadFile(
  file: File,
  options: { maxSizeMb: number; allowedTypes?: string[] }
): { valid: boolean; error?: string } {
  if (file.size > options.maxSizeMb * 1024 * 1024) {
    return {
      valid: false,
      error: `حجم الملف لا يجب أن يتجاوز ${options.maxSizeMb} ميجابايت`,
    };
  }
  if (options.allowedTypes && options.allowedTypes.length > 0 && !options.allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: 'صيغة الملف غير مدعومة',
    };
  }
  return { valid: true };
}

