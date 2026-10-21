const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

function fixture() {
  const text='Fechamento de Caixa - Caixa 003 - Operador TESTE - 10/10/2026';
  const stream='BT /F1 12 Tf 40 700 Td ('+text+') Tj ET';
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+Buffer.byteLength(stream)+' >>\nstream\n'+stream+'\nendstream'
  ];
  let pdf='%PDF-1.4\n';
  const offsets=[0];
  objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=(i+1)+' 0 obj\n'+object+'\nendobj\n';});
  const xref=Buffer.byteLength(pdf);
  pdf+='xref\n0 6\n0000000000 65535 f \n';
  for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return Buffer.from(pdf);
}
test('server extracts a real PDF without dynamically resolving a worker',async()=>{
  const {extractCashPdfText}=await import('../lib/server/cash-pdf.mjs');
  const text=await extractCashPdfText(fixture());
  assert.match(text,/Fechamento de Caixa/);
  assert.match(text,/Caixa 003/);
});
test('malformed PDF rejects, then a subsequent valid PDF still loads',async()=>{
  const {extractCashPdfText}=await import('../lib/server/cash-pdf.mjs');
  await assert.rejects(extractCashPdfText(Buffer.from('%PDF-1.4 invalid')));
  assert.match(await extractCashPdfText(fixture()),/Operador TESTE/);
});
test('published browser worker is the exact installed version and loads',()=>{
  require('./prepare-pdf-worker.cjs');
  const {version}=require('pdfjs-dist/package.json');
  const worker=readFileSync('public/vendor/pdf.worker-'+version+'.min.js','utf8');
  assert.equal(worker,readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.js'),'utf8'));
  const context={URL,URLSearchParams,TextEncoder,TextDecoder,ReadableStream,AbortController,
    structuredClone,setTimeout,clearTimeout,console};
  vm.runInNewContext(worker,context);
  assert.equal(typeof context.pdfjsWorker.WorkerMessageHandler.setup,'function');
});
