const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const origin = process.env.ESTOQUE_BROWSER_URL || 'http://127.0.0.1:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('Somente servidor local');

/** Usa componente, controle de foco e funções reais numa fila sintética isolada. */
async function verifyDiscard(page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin + '/__qa_discard');
  const opener = page.getByRole('button', { name: 'Fechar conferência', exact: true });
  const review = page.getByRole('region', { name: 'Conferência', exact: true });
  const dialog = page.getByRole('dialog');
  await opener.click();
  await review.waitFor({ state: 'detached' });
  assert.equal(await dialog.count(), 0, 'uma nota: X não pergunta');
  await page.getByRole('button', { name: 'Várias notas', exact: true }).click();
  await page.getByLabel('Texto da nota').fill('Edição preservada');
  await opener.click();
  await page.getByRole('dialog', { name: 'Descartar esta nota e os 1 documentos aguardando revisão?', exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await page.getByLabel('Texto da nota').inputValue(), 'Edição preservada');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Fechar conferência');
  await opener.click();
  await dialog.getByRole('button', { name: 'OK', exact: true }).click();
  await review.waitFor({ state: 'detached' });
  await dialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Várias notas', exact: true }).click();
  await review.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await review.waitFor({ state: 'detached' });
  assert.equal(await dialog.count(), 0, 'Cancelar não pergunta mesmo com fila');
  console.log('PASS descarte: uma nota sem pergunta; fila abre, cancela preservando edição/foco, confirma descarta; Cancelar imediato');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try { await verifyDiscard(await browser.newPage()); }
  finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
