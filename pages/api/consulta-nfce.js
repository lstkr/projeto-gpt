// Server-side NFC-e public consultation. Only the official SVRS QR endpoint is allowed.
import { load } from 'cheerio';

const OFFICIAL_HOST = 'dfe-portal.svrs.rs.gov.br';
const ALLOWED_INPUTS = new Map([
  ['dfe-portal.svrs.rs.gov.br', /^\/Dfe\/QrCodeNFce\/?$/i],
  ['www.sefaz.rs.gov.br', /^\/NFCE\/NFCE-COM\.aspx$/i]
]);

function isValidNfceKey(key) {
  if (!/^\d{44}$/.test(key) || key.slice(20, 22) !== '65') return false;
  let sum = 0, weight = 2;
  for (let i = 42; i >= 0; i--) {
    sum += Number(key[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const rem = sum % 11;
  return Number(key[43]) === (rem <= 1 ? 0 : 11 - rem);
}


function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', aacute:'á', eacute:'é', iacute:'í', oacute:'ó', uacute:'ú', ccedil:'ç', Aacute:'Á', Eacute:'É', Iacute:'Í', Oacute:'Ó', Uacute:'Ú', atilde:'ã', otilde:'õ' };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/g, (whole, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return named[entity] ?? whole;
  });
}

function htmlToText(html) {
  const cleaned = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(?:tr|li|p|div|section|article|h[1-6]|table)>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, '\t')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(cleaned)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 180000);
}

function parseMoney(raw) {
  const tokens = String(raw || '').match(/(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,4}|\.\d{1,4})?/g) || [];
  if (!tokens.length) return null;
  const candidate = tokens[tokens.length - 1];
  const number = Number(candidate.includes(',') ? candidate.replace(/\./g, '').replace(',', '.') : candidate);
  return Number.isFinite(number) ? number : null;
}

function parseOfficialItems(html) {
  const $ = load(html);
  const items = [];
  const rows = $('#tabResult tbody tr, tr[id^="Item"], tr[id^="item"]');
  rows.each((_, tr) => {
    const row = $(tr);
    const title = row.find('.txtTit').first();
    const name = title.text().replace(/\s+/g, ' ').trim();
    const quantity = parseMoney(row.find('.Rqtd').first().text());
    const unitPrice = parseMoney(row.find('.RvlUnit').first().text());
    const printedTotal = parseMoney(row.find('.valor').last().text());
    if (!name || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 ||
        !Number.isFinite(printedTotal) || printedTotal < 0) return;
    const codeText = row.find('.RCod').first().text();
    const match = codeText.match(/(?:C[oó]digo\s*:\s*)?(\d{2,14})/i);
    const unitText = row.find('.RUN').first().text().replace(/^\s*UN\s*:\s*/i, '').trim();
    const unit = unitText && /^[a-zA-Z]{1,8}$/.test(unitText) ? unitText.toLowerCase() : 'un';
    items.push({
      name: name.slice(0, 160), code: match ? match[1] : '',
      quantity, unit, unitPrice, lineTotal: printedTotal
    });
  });
  return items;
}

function parseFiscalTotals(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = { subtotal: null, discount: null, total: null };
  for (const line of lines) {
    const name = line.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const value = parseMoney(line);
    if (value === null) continue;
    if (result.subtotal === null && /SUB[ -]?TOTAL/.test(name)) result.subtotal = value;
    if (result.discount === null && /\bDESCONTO\b/.test(name)) result.discount = value;
    if (result.total === null && /VALOR A PAGAR|VALOR TOTAL|TOTAL DA NOTA/.test(name)) result.total = value;
  }
  return result;
}

async function fetchOfficial(url, signal) {
  let target = new URL(url);
  for (let redirect = 0; redirect < 4; redirect++) {
    if (target.protocol !== 'https:' || !ALLOWED_INPUTS.has(target.hostname) ||
        target.username || target.password || target.port) {
      throw new Error('A SEFAZ redirecionou para um endereço não autorizado.');
    }
    const response = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EstoquePlus/1.0)', 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'manual', signal, cache: 'no-store'
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('O portal redirecionou sem informar o destino.');
      target = new URL(location, target);
      continue;
    }
    if (!response.ok) throw new Error('O portal fiscal retornou HTTP ' + response.status + '.');
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) throw new Error('A SEFAZ não retornou HTML.');
    const html = await response.text();
    if (html.length > 1600000) throw new Error('Página grande demais para processar.');
    return { html, sourceUrl: target.toString() };
  }
  throw new Error('O portal fiscal redirecionou a consulta diversas vezes.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  const input = typeof req.body?.url === 'string' ? req.body.url : '';
  if (input.length > 1800) return res.status(400).json({ error: 'Endereço de consulta muito longo.' });
  let target;
  try {
    target = new URL(input);
  } catch (_) {
    return res.status(400).json({ error: 'Endereço do QR Code inválido.' });
  }
  if (target.protocol !== 'https:' || !ALLOWED_INPUTS.has(target.hostname) ||
      !ALLOWED_INPUTS.get(target.hostname).test(target.pathname) ||
      !target.searchParams.has('p') || target.username || target.password || target.port) {
    return res.status(400).json({ error: 'Informe a URL completa do QR Code da NFC-e do Rio Grande do Sul.' });
  }
  const payload = target.searchParams.get('p') || '';
  if (!/^\d{44}\|/.test(payload)) {
    return res.status(400).json({ error: 'O QR Code está incompleto; a chave isolada não permite consultar o cupom automaticamente.' });
  }
  const key = payload.split('|')[0];
  if (!isValidNfceKey(key)) {
    return res.status(422).json({
      error: 'Chave fiscal rejeitada: modelo diferente de 65 ou dígito verificador incorreto. O OCR pode ter trocado ou acrescentado números.'
    });
  }
  // One deadline covers redirects, reading the HTML body and parsing the page.
  // Clearing the timer + aborting the fetch releases resources on timeout or error.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9800);
  try {
    // Both official QR encodings from RS are accepted. Query the SVRS portal
    // canonical endpoint after validating the NFC-e key and full QR payload.
    const canonical = new URL('https://' + OFFICIAL_HOST + '/Dfe/QrCodeNFce');
    canonical.searchParams.set('p', payload);
    const { html, sourceUrl } = await fetchOfficial(canonical, controller.signal);
    if (controller.signal.aborted) throw new Error('Tempo limite de consulta atingido.');
    const text = htmlToText(html);
    if (text.length < 80) throw new Error('Página oficial sem dados legíveis.');
    if (/captcha|recaptcha|verifique que voc[eê] n[aã]o [eé] um rob[oô]/i.test(text)) {
      throw new Error('O portal exige verificação humana; confira a nota na SEFAZ.');
    }
    if (/par[aâ]metro incorreto|modelo de documento n[aã]o reconhecido|nota fiscal n[aã]o encontrada/i.test(text)) {
      throw new Error('O portal recusou a consulta. Confira a chave e o QR Code original.');
    }
    const items = parseOfficialItems(html);
    if (controller.signal.aborted) throw new Error('Tempo limite de consulta atingido.');
    if (!items.length) {
      return res.status(502).json({ error: 'A SEFAZ abriu a página, mas a lista de produtos não veio em um formato estruturado reconhecido. Confira manualmente.' });
    }
    return res.status(200).json({ items, totals: parseFiscalTotals(text), source: 'SVRS', accessKey: key, url: sourceUrl });
  } catch (e) {
    if (controller.signal.aborted || e.name === 'AbortError' || e.name === 'TimeoutError') {
      return res.status(504).json({ error: 'A consulta à SEFAZ demorou mais de 10 segundos. Confira a nota manualmente.' });
    }
    return res.status(502).json({ error: e.message || 'Não foi possível acessar o portal da SVRS neste momento.' });
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
