import { cnpjDigits, validSupplierCnpj, issuerCnpjReadings } from './fiscal-identity.mjs';

const UF = {11:'RO',12:'AC',13:'AM',14:'RR',15:'PA',16:'AP',17:'TO',21:'MA',22:'PI',23:'CE',24:'RN',25:'PB',26:'PE',27:'AL',28:'SE',29:'BA',31:'MG',32:'ES',33:'RJ',35:'SP',41:'PR',42:'SC',43:'RS',50:'MS',51:'MT',52:'GO',53:'DF'};

/** Lê chave numérica de NF-e/NFC-e sem rede e preserva zeros dos identificadores. */
export function readFiscalAccessKey(value) {
  const key = String(value || '').replace(/[\s.-]/g, '');
  if (!/^\d{44}$/.test(key) || !['55','65'].includes(key.slice(20,22))) return null;
  let sum = 0;
  for (let index = 42, weight = 2; index >= 0; index--, weight = weight === 9 ? 2 : weight + 1) sum += Number(key[index]) * weight;
  const remainder = sum % 11;
  if (Number(key[43]) !== (remainder < 2 ? 0 : 11 - remainder)) return null;
  const cnpj = key.slice(6,20), month = key.slice(4,6);
  if (!validSupplierCnpj(cnpj) || !UF[key.slice(0,2)] || Number(month) < 1 || Number(month) > 12) return null;
  return {key, cnpj, uf: UF[key.slice(0,2)], yearMonth: month + '/20' + key.slice(2,4),
    model: key.slice(20,22), series: key.slice(22,25), invoiceNumber: key.slice(25,34)};
}

/** Aceita grupos impressos e chave quebrada em linhas; não corrige dígitos por aproximação. */
export function fiscalKeyCandidates(text) {
  return [...new Set([...String(text || '').matchAll(/(?<!\d)((?:\d[\s.-]*){43}\d)(?!\d)/g)]
    .map(match => match[1].replace(/[\s.-]/g, '')))];
}

/** Confronta apenas o emitente; divergência exige uma escolha humana explícita. */
export function reviewLocalFiscalKey(draft) {
  if (!draft) return {pending: false};
  const candidates = [...new Set([draft.accessKey, draft.qrRaw, draft.ocrText].flatMap(fiscalKeyCandidates))];
  const input = String(draft.accessKeyInput || '').trim();
  const selected = input ? readFiscalAccessKey(input) : null;
  if (input && !selected) return {key: input, pending: true, message: 'Pendente: chave incompleta ou inválida. Confira os 44 dígitos com a nota.'};
  const key = selected?.key || (candidates.length === 1 ? candidates[0] : '');
  const evidence = key + '|' + [...candidates].sort().join('|');
  if (selected && candidates.some(candidate => candidate !== key) && draft.keyReadAcknowledged !== evidence)
    return {key, fields: selected, pending: true, canConfirmKey: true, evidence, message: 'Pendente: a chave digitada difere de outra leitura. Confira qual nota está revisando.'};
  if (!candidates.length && !selected) return {pending: false, message: 'Pendente: chave não identificada. Confira com a nota.'};
  if (candidates.length > 1 && !selected) return {pending: true, message: 'Pendente: há mais de uma chave. Confira se esta imagem contém várias notas.'};
  const fields = selected || readFiscalAccessKey(key);
  if (!fields) return {key, pending: true, message: 'Pendente: chave inválida. Confira os 44 dígitos com a nota.'};
  const rawIssuer = [...issuerCnpjReadings(draft.ocrText), ...(draft.issuerCnpjRead ? [cnpjDigits(draft.issuerCnpjRead)] : [])];
  const observed = [...rawIssuer, ...(draft.supplierCnpj ? [cnpjDigits(draft.supplierCnpj)] : [])];
  const issuerEvidence = fields.key + '|' + [...new Set(rawIssuer)].sort().join('|');
  const confirmed = draft.issuerKeyAcknowledged === issuerEvidence && cnpjDigits(draft.supplierCnpj) === fields.cnpj;
  const conflict = !confirmed && observed.some(value => !validSupplierCnpj(value) || value !== fields.cnpj);
  const numberConflict = Boolean(draft.invoiceNumber && String(draft.invoiceNumber).replace(/^0+/, '') !== fields.invoiceNumber.replace(/^0+/, ''));
  return {key: fields.key, fields, numberConflict, pending: conflict, canConfirmIssuer: conflict, issuerEvidence,
    message: conflict ? 'Pendente: o CNPJ lido diverge do emitente da chave. Confira o emitente, não o destinatário.' : 'Chave e CNPJ do emitente validados localmente. Confira com a nota.'};
}

/** Preenche somente identificação validada; não altera itens, quantidades, custos ou datas. */
export function applyLocalFiscalKey(draft) {
  if (!draft) return draft;
  const review = reviewLocalFiscalKey(draft);
  if (!review.key) return draft;
  return {...draft, accessKey: review.fields ? review.key : '', accessKeyInput: draft.accessKeyInput ?? review.key,
    ...(!review.pending && review.fields ? {supplierCnpj: review.fields.cnpj,
      invoiceNumber: String(draft.invoiceNumber || '').trim() ? draft.invoiceNumber : review.fields.invoiceNumber,
      series: draft.series || review.fields.series} : {})};
}
