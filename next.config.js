// Only non-secret deployment metadata is exposed to the browser bundle.
module.exports = {
  env: {
    ESTOQUE_DEPLOY_ENV: process.env.VERCEL_ENV || '',
    ESTOQUE_SUPABASE_ALLOWED_REF: process.env.ESTOQUE_SUPABASE_ALLOWED_REF || ''
  }
};
