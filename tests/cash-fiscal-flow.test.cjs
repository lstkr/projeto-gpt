const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');

const pdfText = import('../lib/server/cash-pdf-text.mjs');
const cashParser = import('../lib/cash-report-parser.mjs');
const fileType = import('../lib/cash-file-type.mjs');

test('PDF.js text runs with no hasEOL reconstruct rows for cash revenue', async () => {
  const {reconstructCashPdfLines} = await pdfText;
  const {parseCashReport} = await cashParser;
  const rows = [
    ['Caixa do dia: 21/10/2026'],
    ['Caixa Nº: 003'],
    ['Operador: TESTE'],
    ['NFC - e'],
    ['(+)CARTAO DE CREDITO', 'R$ 1.234,56'],
    ['(+)CARTAO DE DEBITO', 'R$ 20,00'],
    ['(+)OUTRAS', 'R$ 5,44'],
    ['(=)Total', 'R$ 1.260,00'],
    ['Movimentações Manuais'],
    ['(+)DINHEIRO', 'R$ 10,00'],
    ['Motivo: SUPRIMENTO - ABERTURA'],
    ['Caixa Digital']
  ];
  const items = rows.flatMap((fragments,index) => fragments.map((str,j) => ({
    str, hasEOL:false,transform:[1,0,0,1,20+j*200,800-index*20]
  })));
  const raw = reconstructCashPdfLines(items);
  assert.match(raw,/CARTAO DE CREDITO R\$ 1\.234,56/);
  assert.equal(raw.split('\n').length,rows.length);
  const result = parseCashReport(raw);
  assert.equal(result.day,'2026-10-21');
  assert.equal(result.operator,'TESTE');
  assert.equal(result.cartaoCredito,'1234.56');
  assert.equal(result.cartaoDebito,'20.00');
  assert.equal(result.outras,'5.44');
  assert.equal(result.reportedTotal,1260);
  assert.equal(result.movements[0].amount,'10.00');
  assert.ok(!result.importWarnings.some(w=>w.includes('não confere')));
});

test('PDF text EOL is honored even without coordinates', async () => {
  const {reconstructCashPdfLines} = await pdfText;
  assert.equal(reconstructCashPdfLines([
    {str:'NFC-e',hasEOL:true},
    {str:'CARTAO CREDITO',hasEOL:false},
    {str:'R$ 15,00',hasEOL:true}
  ]),'NFC-e\nCARTAO CREDITO R$ 15,00');
});

test('missing payment amounts stay zero but import warns instead of guessing',async () => {
  const {parseCashReport}=await cashParser;
  const x=parseCashReport('Caixa do dia: 21/10/2026\nCaixa Nº: 003\nOperador: X\nNFC-e\n(+)CARTAO CREDITO\n(=)Total R$ 99,00\nCaixa Digital');
  assert.equal(x.cartaoCredito,'0');
  assert.ok(x.importWarnings.some(v=>v.includes('Nenhuma modalidade')));
});

test('file signature detection rejects mislabeled files and accepts supported formats',async()=>{
  const {detectCashFileType}=await fileType;
  const bytes=(hex)=>Uint8Array.from(hex.match(/../g).map(s=>parseInt(s,16)));
  assert.equal(detectCashFileType(bytes('255044462d312e37')),'pdf');
  assert.equal(detectCashFileType(bytes('ffd8ffe000104a46')),'image');
  assert.equal(detectCashFileType(bytes('89504e470d0a1a0a')),'image');
  assert.equal(detectCashFileType(bytes('524946460000000057454250')),'image');
  assert.equal(detectCashFileType(bytes('504b030414000000')),null);
  assert.equal(detectCashFileType(new Uint8Array()),null);
});

test('fiscal intake is not blocked by a pending review and reports real batch completion',()=>{
  const ui=readFileSync('pages/index.js','utf8');
  assert.doesNotMatch(ui,/Deseja descartar essa conferência e começar um novo lote/);
  assert.match(ui,/setDraftQueue\(previous=>\[\.\.\.previous,\.\.\.parsed\]\)/);
  assert.match(ui,/completed:i\+1/);
  assert.match(ui,/<progress value=\{uploadBatchProgress\.completed\}/);
  assert.match(ui,/onClick=\{\(\)=>cashFileRef\.current\?\.click\(\)\}/);
});
