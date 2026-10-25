'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { scanSource, inspect, contractSql } = require('../scripts/check-rpc-contract.cjs');

test('RPC scan reads literals, multiline calls and administration consumers', () => {
  const calls = scanSource("client.rpc(\n 'inventory_get', {}); invoke('inventory_user_update', {}); submit(event, 'inventory_user_create', args);", 'sample.js');
  assert.deepEqual(calls.map(c => c.name), ['inventory_get', 'inventory_user_update', 'inventory_user_create']);
  assert.equal(calls[0].line, 1);
});

test('RPC scan excludes comments and strings containing fake calls', () => {
  const source = '// client.rpc(\'fake\')\n/* client.rpc("fake") */\nconst text = "client.rpc(\'fake\')"; client.rpc("real", {});';
  assert.deepEqual(scanSource(source, 'sample.js').map(c => c.name), ['real']);
});

test('RPC scan exposes dynamic names, concatenation and template interpolation', () => {
  const calls = scanSource("client.rpc(name, {}); client.rpc('inventory_' + action, {}); client.rpc(`inventory_${action}`, {});", 'sample.js');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.name === null));
});

test('regular expressions and template strings do not hide subsequent RPC calls', () => {
  const source = "const safe = value.replace(/'/g, '');\nconst label = `Total ${money(1)}`;\nclient.rpc('inventory_count_complete', {});";
  assert.ok(scanSource(source, 'sample.js').some(call => call.name === 'inventory_count_complete'));
});

test('application contract includes indirect user update and has no unreviewed dynamic call', () => {
  const report = inspect(path.resolve(__dirname, '..'));
  assert.ok(report.names.includes('inventory_user_update'));
  assert.ok(report.names.includes('inventory_user_create'));
  assert.ok(report.names.includes('cash_closing_save'));
  assert.ok(report.names.includes('inventory_delete_document'));
  assert.deepEqual(report.unresolved, []);
});

test('catalog SQL checks public pg_proc and fails for missing functions', () => {
  const sql = contractSql(['inventory_user_update']);
  assert.match(sql, /pg_proc/);
  assert.match(sql, /n.nspname = 'public'/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /inventory_user_update/);
  assert.throws(() => contractSql([]), /empty contract/);
  assert.throws(() => contractSql(["invalid'); DROP TABLE x;"]), /Invalid RPC identifier/);
});
