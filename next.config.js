// Expose only non-secret deployment metadata, never session tokens or credentials.
// Shared-db Preview is disabled unless the operator explicitly opts in.
module.exports = {
  env: {
    ESTOQUE_DEPLOY_ENV: process.env.VERCEL_ENV || '',
    ESTOQUE_SHARED_DB_PREVIEW: process.env.ESTOQUE_ALLOW_SHARED_DB_PREVIEW === 'true' ? 'true' : 'false',
    ESTOQUE_PREVIEW_BRANCH: process.env.VERCEL_GIT_COMMIT_REF || ''
  }
};
