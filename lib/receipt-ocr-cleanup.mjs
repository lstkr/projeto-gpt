import { parseThermalOrder } from './thermal-order-ocr.mjs';
import { parseDanfeOcrTable } from './danfe-ocr-table.mjs';

const OCR_REVIEW_THRESHOLD = 70;
const LOW_CONFIDENCE_WARNING = 'OCR com baixa confiança nesta linha. Confira no documento original.';
const UNKNOWN_CONFIDENCE_WARNING = 'Confiança do OCR por linha indisponível. Confira no documento original.';
const normalizedText = (text) => String(text || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

function ocrLines(result) {
  return (result?.blocks || []).flatMap((block) =>
    (block.paragraphs || []).flatMap((paragraph) => paragraph.lines || []));
}

function itemStart(item, text) {
  const code = String(item.code || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!code) return -1;
  const match = new RegExp('(?:^|\\n)\\s*(?:\\d{1,3}\\s+)?' + code + '\\b', 'i').exec(text);
  return match ? match.index : -1;
}

function confidenceWarning(span, lines) {
  const normalized = normalizedText(span);
  const readings = lines.filter((line) => {
    const text = normalizedText(line.text);
    return text && normalized.includes(text);
  });
  if (!normalized || !readings.length) return UNKNOWN_CONFIDENCE_WARNING;
  const scores = readings.flatMap((line) => [line.confidence,
    ...(line.words || []).map((word) => word.confidence)]);
  if (scores.some((score) => typeof score !== 'number' || !Number.isFinite(score)))
    return UNKNOWN_CONFIDENCE_WARNING;
  return scores.some((score) => score < OCR_REVIEW_THRESHOLD) ? LOW_CONFIDENCE_WARNING : '';
}

/** Mantém sugestões e destaca incerteza; confiança nunca aprova nem descarta um item. */
export function receiptItemsFromOcr(result, parseItems) {
  const text = String(result?.text || '').split(/\r?\n/).map((line) => {
    // Líquido é informação fiscal da linha, nunca descrição de mercadoria.
    return /\b(?:VALOR|VL\.?)\s+LIQ(?:UIDO|\.)?\b/i.test(normalizedText(line)) ? '' : line;
  }).join('\n');
  const items = parseThermalOrder(text) ?? parseDanfeOcrTable(text) ?? parseItems(text);
  const starts = items.map((item) => itemStart(item, text));
  const lines = ocrLines(result);
  return items.map((item, index) => {
    const start = starts[index];
    const next = starts.slice(index + 1).find((position) => position > start);
    const span = start < 0 ? '' : text.slice(start, next ?? text.length);
    const warning = confidenceWarning(span, lines);
    return { ...item, readingWarning: [item.readingWarning, warning].filter(Boolean).join(' ') };
  });
}

/** Reinterpreta somente o texto já salvo, por ação humana, sem OCR/rede ou aprovação herdada. */
export function rebuildSavedDanfe(draft, { mergeItems, reconcileTotals }) {
  const readings = String(draft?.ocrText || '').split('--- LEITURA ALTERNATIVA ---');
  if (readings.length > 2 || /--- OUTRO RECORTE/.test(draft?.ocrText || '')) return null;
  const [primary, alternate = ''] = readings;
  const first = parseDanfeOcrTable(primary);
  const second = parseDanfeOcrTable(alternate);
  if (!first?.length && !second?.length) return null;
  const items = mergeItems(first || [], second || []);
  return { ...draft, ...reconcileTotals(primary, alternate, items), items,
    reviewedItems: {}, totalsReviewed: false, finalReviewed: false,
    checkedBy: '', officialVerified: false };
}
