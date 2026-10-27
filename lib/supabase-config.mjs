export const SUPABASE_CONFIG_MISSING = 'SUPABASE_CONFIG_MISSING';

/** Retorna somente a configuração pública explícita, sem destino implícito. */
export function getSupabaseConfig({
  url = process.env.NEXT_PUBLIC_SUPABASE_URL,
  publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
} = {}) {
  if (typeof url !== 'string' || !url.trim() ||
      typeof publicKey !== 'string' || !publicKey.trim()) {
    const error = new Error('Configuração Supabase ausente: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    error.code = SUPABASE_CONFIG_MISSING;
    throw error;
  }
  return { url, publicKey };
}
