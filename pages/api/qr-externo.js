// Optional fallback for QR decoding using pcelias-ctrl/nfc-e's published HTTP API.
// Unlike its NFCE_SP extraction endpoint, the generic QR endpoint accepts RS QR URLs.
// The current UI invokes this fallback automatically when local QR decoding fails.
// The cropped footer can contain fiscal data; review the privacy policy before production use.
const QR_DECODER_URL = process.env.NFCE_QR_DECODER_URL ||
  'https://nfc.kopilot.food/api/v1/qrcode/decode';

export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' }
  }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const input = typeof req.body?.image_base64 === 'string' ? req.body.image_base64 : '';
  const matches = input.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!matches || matches[2].length < 100 || matches[2].length > 1600000) {
    return res.status(400).json({ error: 'Recorte de imagem inválido ou muito grande.' });
  }
  let upstream;
  try {
    upstream = new URL(QR_DECODER_URL);
    if (upstream.protocol !== 'https:' || upstream.username || upstream.password ||
        upstream.port || !upstream.pathname.endsWith('/api/v1/qrcode/decode')) {
      return res.status(500).json({ error: 'Serviço de leitura QR externa não configurado corretamente.' });
    }
  } catch (_) {
    return res.status(500).json({ error: 'Serviço de leitura QR externa não configurado corretamente.' });
  }
  try {
    const response = await fetch(upstream.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ image_base64: input }),
      signal: AbortSignal.timeout(6500),
      cache: 'no-store',
      redirect: 'error'
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.success !== true || data?.qr?.is_url !== true ||
        typeof data.qr.url !== 'string') {
      // A 422 QR_NOT_FOUND is not a failure of the receipt OCR path.
      const code = data?.error?.code === 'QR_NOT_FOUND' ? 'QR_NOT_FOUND' : 'QR_EXTERNAL_UNAVAILABLE';
      return res.status(422).json({
        code,
        error: code === 'QR_NOT_FOUND'
          ? 'O leitor externo também não encontrou um QR Code legível.'
          : 'A API de QR Code não retornou um resultado utilizável.'
      });
    }
    const qrUrl = data.qr.url.trim();
    if (qrUrl.length > 1800) {
      return res.status(422).json({ error: 'O QR Code retornou um endereço maior que o permitido.' });
    }
    const parsed = new URL(qrUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.status(422).json({ error: 'QR Code retornou um endereço inválido.' });
    }
    return res.status(200).json({
      url: qrUrl,
      source: 'pcelias-ctrl/nfc-e (decodificação genérica de QR)'
    });
  } catch (_) {
    return res.status(502).json({
      code: 'QR_EXTERNAL_UNAVAILABLE',
      error: 'Não foi possível acessar a API externa de QR Code. A leitura OCR permanece disponível.'
    });
  }
}
