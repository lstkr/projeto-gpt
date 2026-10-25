const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const jsx = fs.readFileSync(path.join(__dirname, '../pages/index.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../styles/globals.css'), 'utf8');
const start = jsx.indexOf('<div className={\'cash-chart\'');
const end = jsx.indexOf('</div>', start);
const chart = jsx.slice(start, end);

test('gráfico não exibe valores monetários sobre cada barra', () => {
  assert.ok(start > -1, 'o gráfico precisa existir');
  assert.doesNotMatch(chart, /<span>\{hasRevenue\s*\?\s*money\(/, 'rótulos monetários permanentes se sobrepõem em meses cheios');
  assert.doesNotMatch(css, /\.cash-chart-month \.cash-bar-column>span\s*\{/);
  assert.match(jsx, /className="cash-chart-inspector"/);
  assert.match(chart, /aria-label=\{\x60\$\{accessibleDate\}, faturamento/);
});

test('gráfico conserva todos os dias, inclusive dias sem fechamento', () => {
  assert.match(jsx, /Array\.from\(\{length:daysInMonth\}/);
  assert.match(jsx, /revenueByDay\.get\(day\)\?\?0/);
  assert.match(chart, /hasRevenue\?Math\.max\(3,/);
});

test('inspeção por mouse e foco sem mudar valores ou acesso ao detalhamento', () => {
  assert.match(chart, /onMouseEnter=\{\(\)=>hasRevenue&&setCashHighlightedDay\(p\.day\)\}/);
  assert.match(chart, /onFocus=\{\(\)=>hasRevenue&&setCashHighlightedDay\(p\.day\)\}/);
  assert.match(chart, /onClick=\{\(\)=>hasRevenue&&openCashDay\(p\.day\)\}/);
  assert.match(jsx, /cashHighlightedEntry\.revenue/);
  assert.match(jsx, /cashChartData\.revenue/);
});
