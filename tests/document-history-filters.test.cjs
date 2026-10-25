const { test } = require('node:test');
const assert = require('node:assert/strict');
const { syntheticCnpj } = require('./helpers/synthetic-cnpj.cjs');
const issuerCnpj = syntheticCnpj('document-history-issuer');

test('local history filters combine only persisted issue date, supplier text and authorship label', async () => {
  const { filterDocumentHistory } = await import('../lib/document-history.mjs');
  const docs = [
    { id:'verified', date:'2026-10-22T10:00:00-03:00', supplier:'Bah Q Massa', supplierCnpj:issuerCnpj, checkedBy:'Ana', checkedByVerified:true },
    { id:'legacy', date:'22/10/2026', supplier:'Bah Q Massa', checkedBy:'Ana', checkedByVerified:false },
    { id:'unknown', supplier:'Outro fornecedor' }
  ];
  assert.deepEqual(filterDocumentHistory(docs,{from:'2026-10-22',to:'2026-10-22',supplier:issuerCnpj.slice(0, 4),author:'conferido e lançado'}).map(x=>x.id),['verified']);
  assert.deepEqual(filterDocumentHistory(docs,{author:'legada não verificada'}).map(x=>x.id),['legacy']);
  assert.deepEqual(filterDocumentHistory(docs,{author:'não informada'}).map(x=>x.id),['unknown']);
  assert.deepEqual(filterDocumentHistory(docs,{from:'2026-10-22'}).map(x=>x.id),['verified','legacy']);
});

test('history labels never elevate legacy text to authenticated authorship', async () => {
  const { fiscalDocumentAuthorLabel, formatDocumentIssueDate } = await import('../lib/document-history.mjs');
  assert.equal(fiscalDocumentAuthorLabel({checkedBy:'Nome antigo',checkedByVerified:false}),'Autoria legada não verificada: Nome antigo');
  assert.equal(fiscalDocumentAuthorLabel({checkedBy:'Usuário',checkedByVerified:true}),'Conferido e lançado por Usuário');
  assert.equal(fiscalDocumentAuthorLabel({checkedBy:'Usuário'}),'Autoria legada não verificada: Usuário');
  assert.equal(formatDocumentIssueDate('invalid'),'');
  assert.equal(formatDocumentIssueDate('2026-02-31'),'');
});
