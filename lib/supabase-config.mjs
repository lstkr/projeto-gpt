import { previewDatabaseIsBlocked } from './preview-database-policy.mjs';

export const SUPABASE_CONFIG_MISSING = 'SUPABASE_CONFIG_MISSING';

/** Retorna somente a configuração pública explícita, sem destino implícito. */
export function getSupabaseConfig({
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  deploymentEnv = process.env.VERCEL_ENV || process.env.ESTOQUE_DEPLOY_ENV,
  allowedRef = process.env.ESTOQUE_SUPABASE_ALLOWED_REF,
  previewUrl = process.env.NEXT_PUBLIC_SUPABASE_PREVIEW_URL
} = {}) {
  if (typeof url !== 'string' || !url.trim() ||
      typeof publicKey !== 'string' || !publicKey.trim()) {
    const error = new Error('Configuração Supabase ausente: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    error.code = SUPABASE_CONFIG_MISSING;
    throw error;
  }
  if (previewDatabaseIsBlocked({ deploymentEnv, databaseUrl: url, publicKey, allowedRef, previewUrl })) {
    const error = new Error('Banco bloqueado: confira a ref Supabase permitida e as variáveis do ambiente.');
    error.code = 'SUPABASE_DATABASE_BLOCKED';
    throw error;
  }
  return { url, publicKey };
}
