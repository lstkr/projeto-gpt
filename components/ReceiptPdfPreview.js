import { useEffect, useRef, useState } from 'react';

/** Renderiza pixels do PDF localmente, sem links, scripts ou navegação do documento.
 * CL-02: manter até 50 linhas concentra criação, cancelamento e limpeza no mesmo ciclo React.
 */
export default function ReceiptPdfPreview({file}) {
  const canvasRef=useRef(null);
  const [page,setPage]=useState(1), [pages,setPages]=useState(0), [error,setError]=useState('');
  useEffect(() => {
    let active=true, task=null, renderTask=null;
    setError(''); setPages(0);
    async function draw() {
      const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (!active) return;
      pdfjs.GlobalWorkerOptions.workerSrc=`/vendor/pdf.worker-${pdfjs.version}.min.mjs`;
      task=pdfjs.getDocument({data:file.bytes.slice(),isEvalSupported:false,stopAtErrors:true});
      const document=await task.promise;
      if (!active) return;
      const pdfPage=await document.getPage(Math.min(page,document.numPages));
      if (!active) return;
      const base=pdfPage.getViewport({scale:1});
      const MAX_CANVAS_SIDE=1400;
      const viewport=pdfPage.getViewport({scale:Math.min(1.25,MAX_CANVAS_SIDE/Math.max(base.width,base.height))});
      const canvas=canvasRef.current;
      canvas.width=viewport.width; canvas.height=viewport.height;
      renderTask=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport});
      await renderTask.promise;
      if (active) setPages(document.numPages);
    }
    draw().catch(() => { if (active) setError('Não foi possível renderizar o PDF. Use o download do original.'); });
    return () => { active=false; renderTask?.cancel(); if (task) void task.destroy().catch(() => console.warn('PDF_ORIGINAL_CLEANUP_FAILED')); };
  },[file,page]);
  return <div className="giro-pdf"><canvas ref={canvasRef} aria-label={`Página ${page} do PDF original`}/>{error && <p role="status">{error}</p>}
    <div className="giro-pdf-controls"><button type="button" disabled={page <= 1} onClick={() => setPage(value => value-1)} aria-label="Página anterior do original">←</button><span>{pages ? `${page} / ${pages}` : 'Carregando PDF…'}</span><button type="button" disabled={!pages || page >= pages} onClick={() => setPage(value => value+1)} aria-label="Próxima página do original">→</button></div>
  </div>;
}
