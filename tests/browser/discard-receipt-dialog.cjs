const assert = require('node:assert/strict');

/** Exercita o modal real com uma nota manual sintética, sem lançamento de estoque. */
module.exports = async function verifyDiscardReceiptDialog(page) {
  await page.getByRole('button', { name: 'Notas fiscais', exact: true }).click();
  await page.getByRole('button', { name: 'Cadastrar nota manualmente', exact: true }).click();
  const review = page.locator('.review-panel');
  const productSearch = page.getByLabel('Buscar produto da linha 1', { exact: true });
  await productSearch.fill('Nota sintética preservada');
  const opener = page.getByRole('button', { name: 'Descartar conferência', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Descartar esta conferência?', exact: true });
  await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.textContent === 'Continuar conferindo');
  await dialog.getByRole('button', { name: 'Continuar conferindo', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  assert.equal(await review.isVisible(), true, 'cancelar mantém a nota aberta');
  assert.equal(await productSearch.inputValue(), 'Nota sintética preservada', 'cancelar preserva a edição');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Descartar conferência');
  assert.equal(await opener.evaluate(button => document.activeElement === button), true, 'foco retorna à origem');
  await opener.click();
  await dialog.getByRole('button', { name: 'Descartar conferência', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  await review.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: 'Cadastrar nota manualmente', exact: true }).isEnabled(), true);
  console.log('PASS descarte: abre, cancelar preserva nota/edição, foco retorna à origem e confirmar descarta');
};
