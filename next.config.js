// Expose only the deployment *type*, never tokens or server credentials.
// Preview instances must never silently connect to the production stock DB.
module.exports = {
  env: {
    ESTOQUE_DEPLOY_ENV: process.env.VERCEL_ENV || ''
  }
};
