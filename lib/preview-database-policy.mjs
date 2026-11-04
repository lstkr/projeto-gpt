/** Bloqueia Preview/Production fora da ref permitida; preserva o destino explícito do Preview. */
export function previewDatabaseIsBlocked({ deploymentEnv, databaseUrl, publicKey, previewUrl,
  allowedRef = process.env.ESTOQUE_SUPABASE_ALLOWED_REF } = {}) {
  if (!['preview', 'production'].includes(deploymentEnv)) return false;
  if (!publicKey || !/^[a-z0-9]{20}$/.test(allowedRef || '')) return true;
  if (deploymentEnv === 'preview' && (!previewUrl || databaseUrl !== previewUrl)) return true;
  try {
    const target = new URL(databaseUrl);
    return target.hostname !== `${allowedRef}.supabase.co` || target.protocol !== 'https:' || Boolean(target.username || target.password ||
      target.port || target.search || target.hash) || target.pathname !== '/';
  } catch {
    return true;
  }
}
