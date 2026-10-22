const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const quantity = (value) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(value || 0));

// A separate document keeps fiscal drafts, dialogs and count sheets out of print.
export function purchasePrintHtml(plan, issuedAt = new Date()) {
  const groups = (plan.categories || []).map((group) => `<section><h2>${escapeHtml(group.name)}</h2><table><thead><tr><th>Produto / código</th><th>Fornecedor</th><th>Atual / mínimo</th><th>Comprar</th><th>Preço base</th><th>Total previsto</th></tr></thead><tbody>${group.items.map((p) => `<tr><td>${escapeHtml(p.name)}<small>${escapeHtml(p.sku || 'Sem código')}</small></td><td>${escapeHtml(p.usualSupplier || 'A definir')}</td><td>${quantity(p.stock)} / ${quantity(p.min)} ${escapeHtml(p.unit)}</td><td><b>${quantity(p.buy)} ${escapeHtml(p.unit)}</b></td><td>${p.unitEstimate == null ? 'A cotar' : money(p.unitEstimate)}<small>${escapeHtml(p.priceSource)}</small></td><td>${p.estimate == null ? 'A cotar' : money(p.estimate)}</td></tr>`).join('')}</tbody></table><p>Subtotal${group.missingPrices ? ' parcial' : ''}: ${money(group.subtotal)}</p></section>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de compras — Estoque+</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Arial,sans-serif;color:#111}h1{font-size:22px}h2{font-size:16px;margin-top:22px}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid #bbb;padding:7px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}small{display:block;color:#444;margin-top:3px}section>p{text-align:right}footer{font-size:14px;font-weight:bold}</style></head><body><h1>Lista de compras</h1><p>Estoque+ · ${escapeHtml(issuedAt.toLocaleString('pt-BR'))}</p><p>Reposição sugerida = estoque mínimo − saldo atual. Valores estimados; confirmar cotação e disponibilidade.</p>${groups}<footer>Total estimado${plan.missingPrices ? ' (parcial)' : ''}: ${money(plan.total)}</footer>${plan.missingPrices ? `<p>Atenção: ${quantity(plan.missingPrices)} produto(s) sem preço de referência não entram na soma.</p>` : ''}</body></html>`;
}

export function printPurchasePlan(plan) {
  const frame = document.createElement('iframe');
  frame.title = 'Impressão da lista de compras';
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;';
  const remove = () => frame.remove();
  frame.onload = () => {
    frame.contentWindow.addEventListener('afterprint', remove, { once: true });
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };
  frame.srcdoc = purchasePrintHtml(plan);
  document.body.appendChild(frame);
  // Browsers that do not dispatch afterprint must not retain the frame forever.
  setTimeout(remove, 60000);
}
