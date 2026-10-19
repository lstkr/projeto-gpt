import { createClient } from '@supabase/supabase-js';

// Inventory sessions are application tokens stored as hashes in PostgreSQL,
// not Supabase Auth JWTs. The existing inventory_get RPC checks expiry/revocation.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://dpauqdihvhbbaellwjav.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_7YF3ypYXkL-7MVcwozMx7w_AnLDFju7';

export async function requireInventorySession(req, res, { clientFactory = createClient } = {}) {
  const token = req.headers?.['x-estoque-session'];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    res.status(401).json({ error: 'Sessão ausente ou inválida. Entre novamente.' });
    return false;
  }

  try {
    const client = clientFactory(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    // Do not forward the token to the external fiscal or QR services.
    const { data, error } = await client.rpc('inventory_get', { p_session_token: token });
    if (error) {
      // A revoked/expired session is a normal authentication failure.
      if (error.code === '28000') {
        res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
      } else {
        res.status(503).json({ error: 'Não foi possível validar a sessão. Tente novamente.' });
      }
      return false;
    }
    if (!data?.user) {
      res.status(401).json({ error: 'Sessão inválida. Entre novamente.' });
      return false;
    }
    return true;
  } catch (_) {
    res.status(503).json({ error: 'Não foi possível validar a sessão. Tente novamente.' });
    return false;
  }
}
