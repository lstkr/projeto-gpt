// Server-side NFC-e public consultation. Only the official SVRS QR endpoint is allowed.
const ALLOWED_HOST = 'dfe-portal.svrs.rs.gov.br';
const ALLOWED_PATH = /^\/Dfe\/QrCodeNFce\/?$/i;

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
  if (target.protocol !== 'https:' || target.hostname !== ALLOWED_HOST ||
      !ALLOWED_PATH.test(target.pathname) || !target.searchParams.has('p') ||
      target.username || target.password || target.port) {
    return res.status(400).json({ error: 'É necessário um QR Code completo da NFC-e no portal oficial da SVRS.' });
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
  try {
    const response = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EstoquePlus/1.0; NFCe public lookup)', 'Accept': 'text/html,application/xhtml+xml' },
      redirect: 'manual',
      signal: AbortSignal.timeout(14000),
      cache: 'no-store'
    });
    if (response.status >= 300 && response.status < 400) {
      return res.status(502).json({ error: 'O portal redirecionou a consulta; não foi possível ler os itens automaticamente.' });
    }
    if (!response.ok) {
      return res.status(502).json({ error: 'O portal da SVRS retornou HTTP ' + response.status + '.' });
    }
    const type = response.headers.get('content-type') || '';
    if (!type.includes('text/html')) return res.status(502).json({ error: 'A consulta não retornou uma página HTML legível.' });
    const html = await response.text();
    if (html.length > 1600000) return res.status(502).json({ error: 'A página fiscal é grande demais para processar.' });
    const text = htmlToText(html);
    if (text.length < 80) return res.status(502).json({ error: 'A página da SVRS não trouxe texto suficiente para conferir os produtos.' });
    if (/captcha|recaptcha|verifique que voc[eê] n[aã]o [eé] um rob[oô]/i.test(text)) {
      return res.status(502).json({ error: 'O portal solicitou uma verificação humana; abra a consulta oficial para conferir.' });
    }
    return res.status(200).json({ text, source: 'SVRS', url: target.toString() });
  } catch (_) {
    return res.status(502).json({ error: 'Não foi possível acessar o portal da SVRS neste momento. Confira a nota manualmente.' });
  }
}
