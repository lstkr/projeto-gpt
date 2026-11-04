import { getSupabaseConfig, SUPABASE_CONFIG_MISSING } from '../supabase-config.mjs';
// Shared PostgreSQL counters work across Vercel serverless instances.
// No login/token is logged, forwarded to third parties, or stored as plaintext.

export async function enforceFiscalRateLimit(req, res, endpoint, { clientFactory } = {}) {
  const token = req.headers?.['x-estoque-session'];
  // The handler must call requireInventorySession first.
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    res.status(401).json({ error: 'Sessão ausente ou inválida. Entre novamente.' });
    return false;
  }
  if (!['qr', 'nfce'].includes(endpoint)) {
    res.status(503).json({ error: 'Consulta fiscal indisponível.' });
    return false;
  }
  try {
    const { url, publicKey } = getSupabaseConfig();
    const factory = clientFactory || (await import('@supabase/supabase-js')).createClient;
    const client = factory(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await client.rpc('inventory_external_rate_limit', {
      p_session_token: token, p_endpoint: endpoint
    });
    if (error?.code === '28000') {
      res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
      return false;
    }
    if (error || (data?.allowed !== true && data?.allowed !== false)) {
      res.status(503).json({ error: 'Limite de consultas fiscais temporariamente indisponível.' });
      return false;
    }
    if (data.allowed === false) {
      const retry = Number(data.retry_after);
      res.setHeader('Retry-After', String(Number.isInteger(retry) && retry > 0 && retry <= 60 ? retry : 60));
      res.status(429).json({ error: 'Muitas consultas em pouco tempo. Aguarde um instante.' });
      return false;
    }
    return true;
  } catch (error) {
    if (error?.code === SUPABASE_CONFIG_MISSING) {
      res.status(503).json({ error: error.message, code: error.code });
      return false;
    }
    res.status(503).json({ error: 'Limite de consultas fiscais temporariamente indisponível.' });
    return false;
  }
}
