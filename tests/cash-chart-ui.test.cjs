const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cashChartReferences = import('../lib/cash-chart-references.mjs');
const page = fs.readFileSync('pages/index.js', 'utf8');
const styles = fs.readFileSync('styles/globals.css', 'utf8');

test('monthly references ignore missing, malformed and negative daily values', async () => {
  const { summarizeCashMonthly } = await cashChartReferences;
  assert.equal(summarizeCashMonthly([]), null);
  assert.equal(summarizeCashMonthly(null), null);
  assert.equal(summarizeCashMonthly([
    { day: '2026-10-01', revenue: NaN },
    { day: 'bad-date', revenue: 8 },
    { day: '2026-10-02', revenue: -1 },
    { day: '2026-10-03' }
  ]), null);
});

test('monthly references include only launched days and include registered zero-value days', async () => {
  const { summarizeCashMonthly } = await cashChartReferences;
  assert.deepEqual(summarizeCashMonthly([
    { day: '2026-10-10', revenue: 95.5 },
    { day: '2026-10-03', revenue: 0 },
    { day: '2026-10-20', revenue: 95.5 },
    { day: '2026-10-15', revenue: 41.25 }
  ]), {
    minimum: { day: '2026-10-03', revenue: 0 },
    maximum: { day: '2026-10-10', revenue: 95.5 }
  });
});

test('single-day month and tied values use a stable shared reference', async () => {
  const { summarizeCashMonthly } = await cashChartReferences;
  assert.deepEqual(summarizeCashMonthly([{ day: '2026-10-22', revenue: 17.25 }]), {
    minimum: { day: '2026-10-22', revenue: 17.25 },
    maximum: { day: '2026-10-22', revenue: 17.25 }
  });
  assert.deepEqual(summarizeCashMonthly([
    { day: '2026-10-12', revenue: 12.2 },
    { day: '2026-10-11', revenue: 12.2 }
  ]), {
    minimum: { day: '2026-10-11', revenue: 12.2 },
    maximum: { day: '2026-10-11', revenue: 12.2 }
  });
});

test('cash labels, chart values, references and modal stay accessible', () => {
  assert.match(page, /\['CONTROLE FINANCEIRO','Faturamento'/);
  assert.match(page, /aria-label="Faturamento"[^>]*>[\s\S]*?<span>Faturamento<\/span>/);
  assert.match(page, /cash-month-reference-legend/);
  assert.match(page, /cash-reference-line is-maximum/);
  assert.match(page, /cash-reference-line is-minimum/);
  assert.match(page, /cash-bar-value/);
  assert.match(page, /onFocus=\{\(\)=>hasRevenue&&setCashHighlightedDay\(p\.day\)\}/);
  assert.match(page, /onPointerDown=\{event=>event\.pointerType==='touch'/);
  assert.match(page, /aria-label=\{\x60\$\{accessibleDate\}, faturamento \$\{money\(p\.revenue\)\}/);
  assert.match(styles, /\.cash-day-dialog\{width:min\(720px/);
  assert.match(styles, /\.cash-day-channels\{display:grid;grid-template-columns:repeat\(3/);
});

test('compact fiscal progress preserves per-file status and reports failures', () => {
  assert.match(page, /className="fiscal-upload-progress"/);
  assert.match(page, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(page, /Ver andamento dos \{uploadBatchProgress\.total\} arquivos/);
  assert.match(page, /uploadBatchProgress\.files\.map/);
  assert.match(page, /file\.status==='Falhou'/);
  assert.match(page, /uploadBatchProgress\.failed>0/);
  assert.match(styles, /\.fiscal-upload-progress\{max-width:860px[^}]*padding:12px 16px/);
});
