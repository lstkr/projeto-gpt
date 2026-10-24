'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'pages/index.js'),'utf8');
const suppliers=fs.readFileSync(path.join(root,'lib/purchasing.mjs'),'utf8');
const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261024031305_supplier_identity_and_cash_audit.sql'),'utf8');
const retryMigration=fs.readFileSync(path.join(root,'supabase/migrations/20261024032122_cash_closing_retry_after_lock.sql'),'utf8');

test('supplier history uses stable identity and isolates unverified OCR names',()=>{
 assert.match(suppliers,/document\?\.supplierId/);
 assert.match(suppliers,/validSupplierCnpj\(taxId\)/);
 assert.match(suppliers,/unverified:/);
 assert.doesNotMatch(suppliers,/return Boolean\(aName\s*&&\s*bName\s*&&\s*aName\s*===\s*bName\)/);
 assert.match(page,/purchaseHistoryBySupplier\(documents, suppliers, supplierIdentityLinks\)/);
 assert.match(page,/supplier_identity_link/);
});

test('supplier mapping is tenant-scoped, manager-only, CNPJ-safe and append-only',()=>{
 assert.match(migration,/create table private\.supplier_identity_link_audit/);
 assert.match(migration,/actor\.role <> 'admin'/);
 assert.match(migration,/private\.current_tenant\(\)/);
 assert.match(migration,/O CNPJ da nota não corresponde ao fornecedor selecionado/);
 assert.match(migration,/supplier_identity_link_audit_immutable/);
});

test('financial corrections preserve snapshots, reject stale writes and support idempotent restore',()=>{
 assert.match(migration,/before_snapshot jsonb/);
 assert.match(migration,/after_snapshot jsonb not null/);
 assert.match(migration,/idempotency_key uuid/);
 assert.match(migration,/request_hash text/);
 assert.match(migration,/for update/);
 assert.match(retryMigration,/Recheck after the row lock/);
 assert.match(migration,/current_row\.updated_at is distinct from p_expected_updated_at/);
 assert.match(migration,/p_restore_version/);
 assert.match(migration,/cash_closing_updates_require_audit/);
 assert.match(migration,/reject_audit_mutation/);
 assert.match(page,/cash_closing_correct/);
 assert.match(page,/Recuperar esta versão/);
 assert.match(page,/Corrigir fechamento/);
 assert.match(page,/window\.confirm\('A edição ficará registrada/);
 assert.match(page,/openCashClosingDetail\(entry\)/);
});
