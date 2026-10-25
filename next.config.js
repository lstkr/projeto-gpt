const deployEnv = process.env.VERCEL_ENV || '';
if (['preview', 'production'].includes(deployEnv)) {
  const databaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const allowedRef = process.env.ESTOQUE_SUPABASE_ALLOWED_REF || '';
  let url;
  try {
    url = new URL(databaseUrl);
  } catch (_) {
    throw new Error('Missing or invalid Supabase URL for this deployment environment.');
  }
  if (!publicKey.trim() || !/^[a-z0-9]+$/i.test(allowedRef) ||
      url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      url.hostname.toLowerCase() !== allowedRef.toLowerCase() + '.supabase.co') {
    throw new Error('Supabase ref is not authorized for this deployment environment.');
  }
}

module.exports = {
  env: {
    ESTOQUE_DEPLOY_ENV: deployEnv,
    ESTOQUE_SUPABASE_ALLOWED_REF: process.env.ESTOQUE_SUPABASE_ALLOWED_REF || ''
  }
};
