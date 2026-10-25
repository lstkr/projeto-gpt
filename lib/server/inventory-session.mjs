import { deploymentDatabaseIsBlocked } from '../preview-database-policy.mjs';

// Inventory sessions are application tokens stored as hashes in PostgreSQL,
// not Supabase Auth JWTs. Validate them through the dedicated read-only RPC.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://dpauqdihvhbbaellwjav.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_7YF3ypYXkL-7MVcwozMx7w_AnLDFju7';

export async function requireInventorySession(req, res, { clientFactory } = {}) {
  if (deploymentDatabaseIsBlocked({
    deploymentEnv: process.env.VERCEL_ENV,
    databaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publicKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    allowedRef: process.env.ESTOQUE_SUPABASE_ALLOWED_REF
  })) {
    res.status(503).json({ error: 'Banco de homologacao nao autorizado para este ambiente.' });
    return false;
  }
  const token = req.headers?.['x-estoque-session'];
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    res.status(401).json({ error: 'Sessão ausente ou inválida. Entre novamente.' });
    return false;
  }

  try {
    // Lazy-load the production adapter so unit tests can inject a fake RPC
    // without installing the entire Next.js dependency tree.
    const factory = clientFactory || (await import('@supabase/supabase-js')).createClient;
    const client = factory(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    // Do not forward the token to the external fiscal or QR services.
    const { data, error } = await client.rpc('inventory_validate_session', { p_session_token: token });
    if (error) {
      // A revoked/expired session is a normal authentication failure.
      if (error.code === '28000') {
        res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
      } else {
        res.status(503).json({ error: 'Não foi possível validar a sessão. Tente novamente.' });
      }
      return false;
    }
    // Unexpected responses indicate an incompatible/broken RPC, not bad credentials.
    // Fail closed; never fall back to downloading inventory to authenticate.
    if (data?.valid !== true ||
        typeof data.user?.id !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.user.id) ||
        !['admin', 'employee'].includes(data.user?.role)) {
      res.status(503).json({ error: 'Não foi possível validar a sessão. Tente novamente.' });
      return false;
    }
    return true;
  } catch (_) {
    res.status(503).json({ error: 'Não foi possível validar a sessão. Tente novamente.' });
    return false;
  }
}

