const fs = require('node:fs');
const path = require('node:path');

const PLAN_PATH = path.join(__dirname, 'clean-install-plan.json');

function maskCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\r\n]/g, ' '))
    .replace(/--[^\r\n]*/g, (match) => match.replace(/[^\r\n]/g, ' '))
    .replace(/'(?:''|[^'])*'/g, (match) => match.replace(/[^\r\n]/g, ' '));
}

function sourceLocation(source, offset) {
  return source.slice(0, offset).split('\n').length;
}

function scanDrops(file, executable, plan) {
  return [...executable.matchAll(/\bDROP\s+(\w+)/gi)].flatMap((match) => {
    const line = sourceLocation(executable, match.index);
    const allowed = plan.authorizedDrops.some((item) =>
      item.file === file && item.line === line && item.kind === match[1].toUpperCase());
    const statementEnd = executable.indexOf(';', match.index);
    const statement = executable.slice(match.index, statementEnd < 0 ? undefined : statementEnd);
    const cascade = /\bCASCADE\b/i.test(statement);
    return !allowed || cascade
      ? [`${file}:${line}: DROP ${match[1].toUpperCase()}${cascade ? ' CASCADE' : ''} não autorizado`]
      : [];
  });
}

function scanTruncatesAndMassDeletes(file, executable) {
  const errors = [];
  for (const match of executable.matchAll(/\bTRUNCATE\b/gi)) {
    errors.push(`${file}:${sourceLocation(executable, match.index)}: TRUNCATE não permitido`);
  }

  for (const match of executable.matchAll(/\bDELETE\s+FROM\b[\s\S]*?(?:;|$)/gi)) {
    if (!/\bWHERE\b/i.test(match[0])) {
      errors.push(`${file}:${sourceLocation(executable, match.index)}: DELETE sem WHERE`);
    }
  }

  return errors;
}

function scanDeleteCascades(file, executable, plan) {
  const errors = [];
  for (const match of executable.matchAll(/\bON\s+DELETE\s+CASCADE\b/gi)) {
    const line = sourceLocation(executable, match.index);
    const tables = [...executable.slice(0, match.index).matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.]+)/gi)];
    const currentTable = tables.at(-1)?.[1]?.toLowerCase();
    const allowed = plan.authorizedDeleteCascades.some((item) =>
      item.file === file && item.line === line && item.table === currentTable);
    if (!allowed) errors.push(`${file}:${line}: ON DELETE CASCADE não autorizado`);
  }
  return errors;
}

function scanSql(file, source, plan) {
  const executable = maskCommentsAndStrings(source);
  return [
    ...scanDrops(file, executable, plan),
    ...scanTruncatesAndMassDeletes(file, executable),
    ...scanDeleteCascades(file, executable, plan)
  ];
}

function scanInstallSql(root, plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'))) {
  return [...plan.base, ...plan.migrations].flatMap((file) =>
    scanSql(file, fs.readFileSync(path.join(root, file), 'utf8'), plan));
}

module.exports = { scanInstallSql, scanSql };

if (require.main === module) {
  const errors = scanInstallSql(path.resolve(__dirname, '../..'));
  if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('PASS: roteiro SQL sem instruções destrutivas fora da allowlist.\n');
  }
}
