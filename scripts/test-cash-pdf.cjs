const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');

const {fixture}=require('./pdf-test-fixture.cjs');
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
test('published browser worker is the exact installed version and loads',async()=>{
  require('./prepare-pdf-worker.cjs');
  const {version}=require('pdfjs-dist/package.json');
  const worker=readFileSync('public/vendor/pdf.worker-'+version+'.min.mjs','utf8');
  assert.equal(worker,readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),'utf8'));
  const published=await import(pathToFileURL(path.resolve('public/vendor/pdf.worker-'+version+'.min.mjs')).href);
  assert.equal(typeof published.WorkerMessageHandler.setup,'function');
});
