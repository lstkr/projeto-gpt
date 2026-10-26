'use strict';

// Dependency-free lexical scan. Dynamic calls fail closed unless their transport
// and literal consumers are explicitly reviewed below. This is an existence
// contract; database acceptance suites still verify authorization and behavior.
const fs = require('node:fs');
const path = require('node:path');

function tokens(source) {
  const result = [];
  const re = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|`(?:\\.|[^`\\])*`|[A-Za-z_$][\w$]*|[^\s]/g;
  for (const match of source.matchAll(re)) {
    const text = match[0];
    if (text.startsWith('//') || text.startsWith('/*')) continue;
    result.push({ text, offset: match.index });
  }
  return result;
}

function literal(token) {
  if (!token || !/^['"`]/.test(token.text)) return null;
  const text = token.text;
  // Escapes/interpolation are deliberately unresolved, never evaluated.
  if (text.includes('\\') || text.includes('${')) return null;
  return text.slice(1, -1);
}

function scanSource(source, file) {
  const ts = tokens(source);
  const calls = [];
  for (let i = 0; i < ts.length; i++) {
    if (ts[i - 1]?.text === 'function') continue;
    let kind, arg;
    if (ts[i].text === '.' && ts[i + 1]?.text === 'rpc' && ts[i + 2]?.text === '(') {
      kind = 'rpc'; arg = i + 3;
    } else if (ts[i].text === 'invoke' && ts[i + 1]?.text === '(') {
      kind = 'invoke'; arg = i + 2;
    } else if (ts[i].text === 'submit' && ts[i + 1]?.text === '(' && ts[i + 2]?.text === 'event' && ts[i + 3]?.text === ',') {
      kind = 'submit'; arg = i + 4;
    } else continue;
    const name = literal(ts[arg]);
    // A concatenated string is an expression, not a static RPC name.
    const staticName = name !== null && [',', ')'].includes(ts[arg + 1]?.text) ? name : null;
    calls.push({ file, line: source.slice(0, ts[i].offset).split('\n').length,
      kind, name: staticName, expression: ts[arg]?.text || '<missing>' });
  }
  return calls;
}

function inspect(root) {
  const calls = [];
  function visit(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(?:[cm]?js|jsx|ts|tsx)$/.test(entry.name)) {
        calls.push(...scanSource(fs.readFileSync(full, 'utf8'), path.relative(root, full).replaceAll('\\', '/')));
      }
    }
  }
  for (const dir of ['pages', 'lib', 'components']) visit(path.join(root, dir));
  const reviewed = new Set([
    'pages/index.js:rpc:name',
    'components/TenantAdministration.js:invoke:operation'
  ]);
  const unresolved = calls.filter(call => call.name === null &&
    !reviewed.has(`${call.file}:${call.kind}:${call.expression}`));
  const names = [...new Set(calls.filter(call => call.name !== null).map(call => call.name))].sort();
  for (const name of names) if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error(`Invalid RPC identifier: ${name}`);
  return { calls, names, unresolved };
}

function contractSql(names) {
  if (!names.length) throw new Error('No RPC calls found; refusing an empty contract.');
  for (const name of names) if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('Invalid RPC identifier');
  return `-- Generated from application RPC consumers; read-only catalog assertion.\nDO $rpc_contract$\nDECLARE missing text;\nBEGIN\n  SELECT string_agg(required.name, ', ' ORDER BY required.name) INTO missing\n  FROM unnest(ARRAY[${names.map(name => `'${name}'`).join(', ')}]::text[]) required(name)\n  WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace\n    WHERE n.nspname = 'public' AND p.proname = required.name AND p.prokind = 'f');\n  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Application RPC contract missing public functions: %', missing; END IF;\nEND\n$rpc_contract$;\n`;
}

if (require.main === module) {
  try {
    const report = inspect(path.resolve(__dirname, '..'));
    if (report.unresolved.length) throw new Error(`Unreviewed dynamic RPC calls: ${report.unresolved.map(c => `${c.file}:${c.line} (${c.kind}: ${c.expression})`).join(', ')}`);
    if (process.argv.includes('--emit-sql')) process.stdout.write(contractSql(report.names));
    else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { scanSource, inspect, contractSql };
