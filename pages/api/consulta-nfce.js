import { parseNfceMetadata } from '../../lib/server/nfce-metadata.mjs';
import { requireInventorySession } from '../../lib/server/inventory-session.mjs';
import { enforceFiscalRateLimit } from '../../lib/server/fiscal-rate-limit.mjs';
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
      await response.body?.cancel().catch(() => {});
      target = new URL(location, target);
      continue;
    }
    if (!response.ok) throw new Error('O portal fiscal retornou HTTP ' + response.status + '.');
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) throw new Error('A SEFAZ não retornou HTML.');
    // Bound memory *while* downloading, not only after response.text() allocates.
    const cap = 1600000;
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > cap) throw new Error('A resposta fiscal excedeu o limite de segurança.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Resposta da SEFAZ sem corpo legível.');
    const charset = type.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] || 'utf-8';
    let decoder;
    try { decoder = new TextDecoder(charset); }
    catch (_) { decoder = new TextDecoder('utf-8'); }
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > cap) throw new Error('Resposta da SEFAZ muito grande para processar.');
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    return { html: chunks.join(''), sourceUrl: target.toString() };
  }
  throw new Error('O portal fiscal redirecionou a consulta diversas vezes.');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });
  if (!await requireInventorySession(req, res)) return;
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
  // Limit upstream calls per user and globally, consistently across deployments.
  if (!await enforceFiscalRateLimit(req, res, 'nfce')) return;
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
    const metadata = parseNfceMetadata(html, text, key);
    return res.status(200).json({ items, ...metadata, source: 'SVRS', accessKey: key, url: sourceUrl });
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
