// Pure guard shared between the confirmation UI and regression tests.
// A fiscal entry may be posted only after the EXACT requested draft is acknowledged.
export function pendingConfirmationState(request, current, persistedFingerprint, saveError) {
  if (!request) return 'idle';
  if (!current || current.pendingId !== request.id) return 'switched';
  if (current.fingerprint !== request.fingerprint) return 'changed';
  if (saveError) return 'failed';
  if (persistedFingerprint !== request.fingerprint) return 'waiting';
  return 'ready';
}
