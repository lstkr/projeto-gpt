// Vercel Preview and Production must use the exact Supabase project
// configured for that environment. Local development remains unrestricted.
export function deploymentDatabaseIsBlocked({
  deploymentEnv,
  databaseUrl,
  publicKey,
  allowedRef
} = {}) {
  if (!['preview', 'production'].includes(deploymentEnv)) return false;
  if (typeof databaseUrl !== 'string' || !databaseUrl.trim() ||
      typeof publicKey !== 'string' || !publicKey.trim() ||
      typeof allowedRef !== 'string' || !/^[a-z0-9]+$/i.test(allowedRef)) return true;

  let url;
  try {
    url = new URL(databaseUrl);
  } catch (_) {
    return true;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash) return true;

  return url.hostname.toLowerCase() !== `${allowedRef.toLowerCase()}.supabase.co`;
}
