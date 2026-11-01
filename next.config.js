// Expose only non-secret deployment metadata, never session tokens or credentials.
// O destino de preview é configurado somente por variáveis públicas explícitas.
module.exports = {
  env: {
    ESTOQUE_DEPLOY_ENV: process.env.VERCEL_ENV || ''
  }
};
