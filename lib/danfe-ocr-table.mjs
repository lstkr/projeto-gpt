const DECIMAL_SCALE = 10_000n;
const AMOUNT_PATTERN = /\b\d+(?:\.\d{3})*,\d{2,4}\b/g;
const TAX_PATTERN = /\b\d{8}\s*[| ]+\d{3,4}\s*[| ]*\d{4}\s*[| ]*(UN|KG|G|LT|L|ML|CX|PCT)\b/g;
const TABLE_WARNING = 'Tabela DANFE reconstruída do OCR. Confira código, descrição, quantidade, preço e total na imagem.';

function normalized(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

function productTable(text) {
  const source = String(text || '');
  const header = /DADOS\s+DO\s+PRODUTO\s*\/\s*SERVICO/.exec(normalized(source));
  if (!header) return /\bDANFE\b/.test(normalized(source)) ? '' : null;
  const remaining = source.slice(header.index + header[0].length);
  const end = /DADOS\s+ADICIONAIS|RESERVADO\s+AO\s+FISCO|INFORMACOES\s+COMPLEMENTARES/.exec(normalized(remaining));
  return remaining.slice(0, end?.index ?? remaining.length);
}

function fixedDecimal(value) {
  const [whole, fraction = ''] = value.replaceAll('.', '').split(',');
  return BigInt(whole) * DECIMAL_SCALE + BigInt(fraction.padEnd(4, '0'));
}

function descriptions(table) {
  const lines = table.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const products = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (new RegExp(TAX_PATTERN.source).test(normalized(line))) {
      // Uma linha inteira pode começar com o código e terminar com os tributos.
      if (/^\d{8}\b/.test(line)) continue;
    }
    const match = /^(\d{3,14})(?:\s+(.+))?$/.exec(line);
    if (!match) continue;
    const name = (match[2] || lines[index + 1] || '').split(/\s+\d{8}\b/)[0].trim();
    if (!/[A-Za-zÀ-ÿ]{3}/.test(name) || /[|]|CST|CFOP|VL\s*UNIT/i.test(name)) continue;
    products.push({ code: match[1], name });
  }
  return products;
}

function fiscalQuantities(table) {
  const rows = [];
  for (const tax of normalized(table).matchAll(TAX_PATTERN)) {
    const start = tax.index + tax[0].length;
    const next = /^[\s|)]*(\d+(?:\.\d{3})*,\d{2,4})\b/.exec(table.slice(start));
    if (!next) return [];
    const offset = next[0].lastIndexOf(next[1]);
    rows.push({ unit: tax[1].toLowerCase(), value: fixedDecimal(next[1]),
      index: start + offset });
  }
  return rows;
}

function assembleItems(products, quantities, prices) {
  if (!products.length || quantities.length !== products.length || prices.length !== products.length * 2)
    return [];
  const items = [];
  for (let index = 0; index < products.length; index++) {
    const quantity = quantities[index];
    const unitPrice = prices[index * 2];
    const lineTotal = prices[index * 2 + 1];
    // A aritmética decimal exata apenas rejeita leitura incoerente; não autoriza lançamento.
    if (quantity.value <= 0n || quantity.value > 100_000n * DECIMAL_SCALE ||
        unitPrice > 1_000_000n * DECIMAL_SCALE || lineTotal > 1_000_000n * DECIMAL_SCALE ||
        quantity.value * unitPrice !== lineTotal * DECIMAL_SCALE) return [];
    items.push({ ...products[index], quantity: Number(quantity.value) / Number(DECIMAL_SCALE),
      unit: quantity.unit, unitPrice: Number(unitPrice) / Number(DECIMAL_SCALE),
      lineTotal: Number(lineTotal) / Number(DECIMAL_SCALE), itemDiscount: 0,
      unitInferred: false, readingWarning: TABLE_WARNING });
  }
  return items;
}

/** Retorna null para cupom comum; DANFE sem tabela íntegra não usa fallback fora da tabela. */
export function parseDanfeOcrTable(text) {
  const table = productTable(text);
  if (table === null) return null;
  // Não remover o sinal de ajuste/devolução e sugerir valor positivo por engano.
  if (/[+−-]\s*\d+(?:\.\d{3})*,\d{2,4}/.test(table)) return [];
  const products = descriptions(table);
  const quantities = fiscalQuantities(table);
  const quantityPositions = new Set(quantities.map((quantity) => quantity.index));
  const prices = [...table.matchAll(AMOUNT_PATTERN)]
    .filter((match) => !quantityPositions.has(match.index)).map((match) => fixedDecimal(match[0]));
  return assembleItems(products, quantities, prices);
}
