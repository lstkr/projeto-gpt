import { CASH_CHANNELS, isClosingWithdrawal } from './cash-closing.mjs';

const MAX_AMOUNT_CENTS = 9_999_999_900n;
const MAX_REASON_LENGTH = 300;
const MAX_MOVEMENTS = 100;

function validateClosingFields(snapshot) {
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(snapshot.day || '') &&
    !Number.isNaN(Date.parse(snapshot.day)) && new Date(snapshot.day).toISOString().slice(0, 10) === snapshot.day;
  if (!validDate) throw new Error('Data inválida.');
  if (!String(snapshot.register || '').trim() || !String(snapshot.operator || '').trim()) {
    throw new Error('Informe o número do caixa e o operador.');
  }
  if (!Array.isArray(snapshot.movements) || snapshot.movements.length > MAX_MOVEMENTS ||
    snapshot.movements.some(movement => !['sangria', 'suprimento'].includes(movement.type) ||
      !String(movement.reason || '').trim())) throw new Error('Informe tipo e motivo das movimentações.');
  if (!snapshot.cashReviewed) throw new Error('Marque a conferência ao lado do botão salvar.');
  if (snapshot.cashCounted == null || snapshot.cashCounted === '') throw new Error('Informe o dinheiro contado.');
}

/** Serializa dinheiro sem arredondar nem calcular em ponto flutuante. */
export function exactCashDecimal(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Informe valores monetários com até duas casas decimais.');
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > MAX_AMOUNT_CENTS) throw new Error('Valor monetário acima do limite permitido.');
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

function cashCents(value) {
  return BigInt(exactCashDecimal(value).replace('.', ''));
}

function validateAvailableCash(entry) {
  const available = entry.movements.filter((movement) => movement.type !== 'sangria' || !isClosingWithdrawal(movement.reason))
    .reduce((balance, movement) => balance + (movement.type === 'suprimento' ? 1n : -1n) * cashCents(movement.amount),
      cashCents(entry.dinheiroVendas));
  if (available < 0n) throw new Error('Sangrias excedem os valores em dinheiro disponíveis');
}

/** Prepara o contrato existente e exige revisão e motivo somente na correção. */
export function prepareCashClosing(snapshot) {
  validateClosingFields(snapshot);
  const { cashReviewed, revision, expectedRevision, correctionReason, ...entry } = snapshot;
  const clean = { ...entry, register: entry.register.trim(), operator: entry.operator.trim(),
    ...Object.fromEntries(CASH_CHANNELS.map(([key]) => [key, exactCashDecimal(snapshot[key] ?? '0')])),
    cashCounted: exactCashDecimal(snapshot.cashCounted),
    movements: snapshot.movements.map((movement) => ({ type: movement.type,
      reason: movement.reason.trim(), amount: exactCashDecimal(movement.amount) })) };
  validateAvailableCash(clean);
  if (snapshot.id) Object.assign(clean, correctionMetadata({ revision, correctionReason }));
  return clean;
}

function correctionMetadata({ revision, correctionReason }) {
  const reason = String(correctionReason || '').trim();
  if (!reason || reason.length > MAX_REASON_LENGTH) throw new Error('Informe o motivo da correção (até 300 caracteres).');
  if (typeof revision !== 'string' || !/^(0|[1-9]\d*)$/.test(revision)) {
    throw new Error('Recarregue o fechamento para obter sua revisão antes de corrigir.');
  }
  return { expectedRevision: revision, correctionReason: reason };
}

/** Reutiliza a tentativa após falha de rede; mudar campos cria uma nova tentativa. */
export function cashCorrectionAttempt(entry, previousAttempt, createId) {
  const fingerprint = JSON.stringify(entry);
  return previousAttempt?.fingerprint === fingerprint ? previousAttempt :
    {fingerprint, requestId: createId()};
}
