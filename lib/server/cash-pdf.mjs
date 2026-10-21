import pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.js';

// Resolve the worker statically: Next.js cannot trace PDF.js's dynamic require.
globalThis.pdfjsWorker = pdfjsWorker;

export async function extractCashPdfText(bytes) {
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes), useSystemFonts: true,
    disableFontFace: true, stopAtErrors: false, isEvalSupported: false
  });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 5); p++) {
      const page = await pdf.getPage(p);
      try {
        const content = await page.getTextContent({disableCombineTextItems:false});
        let output = '';
        for (const item of content.items) {
          if (typeof item.str !== 'string') continue;
          output += item.str + (item.hasEOL ? '\n' : ' ');
        }
        pages.push(output);
      } finally { page.cleanup(); }
    }
    return pages.join('\n').slice(0,80000);
  } finally { await task.destroy(); }
}
