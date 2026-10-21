const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const page = fs.readFileSync('pages/index.js','utf8');
const sql = fs.readFileSync('db/pending-receipts.sql','utf8');

test('pending cancellation is guarded by database role, not UI alone', () => {
  assert.match(sql,/function public\.pending_receipt_cancel\(p_token text, p_id uuid\)/);
  assert.match(sql,/actor_role is distinct from 'admin'/);
  assert.match(sql,/existing\.state <> 'pending'/);
  assert.match(sql,/state='cancelled'/);
  assert.match(sql,/cancelled_by=actor_id/);
  // A UI deve exigir papel gestor E permissao explicita; a RPC aplica a barreira real.
  assert.match(page,/currentUser\?\.role==='admin'&&canFiscal\('fiscal\.pending\.cancel'\)&&<button[^>]*className="btn secondary"/);
  assert.match(page,/currentUser\?\.role !== 'admin' \|\| !canFiscal\('fiscal\.pending\.cancel'\)/);
});
test('official data becomes default only for verified SEFAZ response', () => {
  assert.match(page,/data\.source !== 'SVRS' \|\| data\.accessKey !== expectedKey/);
  assert.match(page,/items: officialItems\.map/);
  assert.match(page,/officialApplied: true, finalReviewed:false, officialVerified:true/);
});
test('financial discrepancies are review warnings while invalid totals still block', () => {
  assert.match(page,/financialWarnings\.length && !window\.confirm/);
  assert.match(page,/totalsFinalMismatch && 'O total calculado difere/);
  assert.match(page,/if \(draftTotal < -0\.01\)/);
  assert.match(page,/receiptReviewRows\.some\(\(row\) => !row\.done\)/);
  assert.match(page,/draft\?\.finalReviewed \|\| !draft\?\.checkedBy\?\.trim\(\)/);
});
