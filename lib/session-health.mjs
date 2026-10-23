// Defensive classification for native session health checks; backend is the
// only authority. Never infer revocation from a transient network error.
export function sessionHealth({ data, error } = {}) {
  if (!error && data?.valid === true) return 'valid';
  const code=String(error?.code||'').trim();
  const message=String(error?.message||'');
  if (code==='28000' || (!error && data?.valid === false) ||
      /sess[aã]o\s+(inv[aá]lida|revogada|expirada)/i.test(message))
    return 'revoked';
  return 'unavailable';
}

export const SESSION_CHECK_INTERVAL_MS=2500;
