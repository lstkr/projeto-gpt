// The Vercel Preview must never select the live cafe database accidentally.
// For the current manual homologation cycle the operator may explicitly allow
// the EXISTING test database, but only for the reviewed PR branch.
// This policy never changes session validation, user records or RLS.
export const SHARED_DATABASE_PROJECT_ID = 'dpauqdihvhbbaellwjav';
export const HOMOLOGATION_BRANCHES = Object.freeze([
  'codex/homologacao-completa-20261023',
  'codex/urgent-homologacao-20261025'
]);

export function previewDatabaseIsBlocked({
  deploymentEnv,
  databaseUrl,
  publicKey,
  allowSharedDatabase = false,
  branch = ''
} = {}) {
  if (deploymentEnv !== 'preview') return false;
  if (typeof databaseUrl !== 'string' || !databaseUrl.trim() ||
      typeof publicKey !== 'string' || !publicKey.trim()) return true;

  let url;
  try {
    url = new URL(databaseUrl);
  } catch (_) {
    return true;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return true;

  // Maintain compatibility with previews using a separate Supabase project.
  // A shared/live project additionally requires an explicit, branch-scoped opt-in.
  if (url.toString().includes(SHARED_DATABASE_PROJECT_ID)) {
    return !(allowSharedDatabase === true && HOMOLOGATION_BRANCHES.includes(branch));
  }
  return false;
}


