const { test } = require('node:test');
const assert = require('node:assert/strict');

test('cash report viewer accepts only matching passive signatures', async () => {
  const { cashReportMimeFromBytes, cashReportFileMatchesMime } = await import('../lib/cash-report-ui.mjs');
  assert.equal(cashReportMimeFromBytes(Uint8Array.from([0x25,0x50,0x44,0x46,0x2d,0x31])), 'application/pdf');
  assert.equal(cashReportMimeFromBytes(Uint8Array.from([0xff,0xd8,0xff,0x00])), 'image/jpeg');
  assert.equal(cashReportMimeFromBytes(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), 'image/png');
  assert.equal(cashReportMimeFromBytes(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])), 'image/webp');
  assert.equal(cashReportMimeFromBytes(new TextEncoder().encode('<svg/>')), null);
  assert.equal(cashReportFileMatchesMime('image/png', Uint8Array.from([0xff,0xd8,0xff])), false);
});

test('cash report bytes round-trip and download names cannot carry paths or active extensions', async () => {
  const { encodeCashReportBase64, decodeCashReportBase64, cashReportSafeDownloadName } = await import('../lib/cash-report-ui.mjs');
  const bytes=Uint8Array.from([0,1,127,128,255]);
  assert.deepEqual(decodeCashReportBase64(encodeCashReportBase64(bytes)),bytes);
  assert.equal(cashReportSafeDownloadName('../relatorio.pdf'),'_relatorio.pdf');
  assert.equal(cashReportSafeDownloadName('nota.svg'),'nota.svg');
  assert.throws(()=>decodeCashReportBase64(''),/Arquivo inválido/);
});

test('cash report UI consumes only versioned pending-report RPCs and keeps manual closing flow', () => {
  const fs=require('node:fs');
  const page=fs.readFileSync('pages/index.js','utf8');
  for(const name of ['cash_report_create','cash_reports_list','cash_report_file','cash_report_save','cash_report_cancel','cash_report_post']) assert.ok(page.includes(name),name);
  assert.match(page,/type="file"[^>]*multiple/);
  assert.match(page,/onSubmit=\{cashEntryMode==='report-review'\?savePendingCashReport:saveCashClosing\}/);
  assert.match(page,/cash_report_post/);
  assert.match(page,/Faturamentos pendentes/);
  assert.match(page,/Abrir original/);
  assert.match(page,/Baixar original/);\n  assert.match(page,/cashReportPreview\\.mime==='application\\/pdf'/);\n  assert.match(page,/cashReportFileMatchesMime/);
});
