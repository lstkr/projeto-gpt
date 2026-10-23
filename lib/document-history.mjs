export function fiscalDocumentAuthorLabel(document) {
  if (document?.checkedByVerified === true && document.checkedBy) return 'Conferido e lançado por ' + document.checkedBy;
  if (document?.checkedBy) return 'Autoria legada não verificada: ' + document.checkedBy;
  return 'Autoria não informada';
}

function localDateKey(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

export function documentIssueDateKey(value) {
  if (!value || typeof value !== 'string') return null;
  const raw = value.trim();
  const isoDate = raw.match(/^(\\d{4})-(\\d{2})-(\\d{2})(?:$|T)/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const check = new Date(Number(year), Number(month) - 1, Number(day));
    if (check.getFullYear() !== Number(year) || check.getMonth() !== Number(month) - 1 || check.getDate() !== Number(day)) return null;
    return year + '-' + month + '-' + day;
  }
  const brazilianDate = raw.match(/^(\\d{2})\\/(\\d{2})\\/(\\d{4})$/);
  if (brazilianDate) {
    const [, day, month, year] = brazilianDate;
    const check = new Date(Number(year), Number(month) - 1, Number(day));
    if (check.getFullYear() !== Number(year) || check.getMonth() !== Number(month) - 1 || check.getDate() !== Number(day)) return null;
    return year + '-' + month + '-' + day;
  }
  const parsed = new Date(raw);
  return localDateKey(parsed);
}

export function formatDocumentIssueDate(value) {
  const key = documentIssueDateKey(value);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(year, month - 1, day));
}

export function filterDocumentHistory(documents, filters = {}) {
  const query = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');
  const supplierQuery = query(filters.supplier);
  const authorQuery = query(filters.author);
  return (Array.isArray(documents) ? documents : []).filter((document) => {
    const issueDate = documentIssueDateKey(document?.date);
    if (filters.from && (!issueDate || issueDate < filters.from)) return false;
    if (filters.to && (!issueDate || issueDate > filters.to)) return false;
    if (supplierQuery) {
      const supplierText = query([document?.supplier, document?.supplierCnpj].filter(Boolean).join(' '));
      if (!supplierText.includes(supplierQuery)) return false;
    }
    if (authorQuery && !query(fiscalDocumentAuthorLabel(document)).includes(authorQuery)) return false;
    return true;
  });
}
