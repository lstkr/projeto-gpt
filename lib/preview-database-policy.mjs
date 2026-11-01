/** Bloqueia preview sem destino HTTPS explícito ou divergente da configuração. */
export function previewDatabaseIsBlocked({ deploymentEnv, databaseUrl, publicKey, previewUrl } = {}) {
  if (deploymentEnv !== 'preview') return false;
  if (!publicKey || !previewUrl || databaseUrl !== previewUrl) return true;
  try {
    const target = new URL(databaseUrl);
    return target.protocol !== 'https:' || Boolean(target.username || target.password ||
      target.port || target.search || target.hash) || target.pathname !== '/';
  } catch {
    return true;
  }
}
