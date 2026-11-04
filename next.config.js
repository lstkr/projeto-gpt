// A ref é pública; validar antes do build não abre conexão com o banco.
module.exports = async () => {
  const { getSupabaseConfig } = await import('./lib/supabase-config.mjs');
  if (['preview', 'production'].includes(process.env.VERCEL_ENV)) getSupabaseConfig();
  return {
    env: {
      ESTOQUE_DEPLOY_ENV: process.env.VERCEL_ENV || '',
      ESTOQUE_SUPABASE_ALLOWED_REF: process.env.ESTOQUE_SUPABASE_ALLOWED_REF || ''
    }
  };
};
