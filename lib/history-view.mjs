import {validInsightDay} from './insight-period.mjs';

/** Normaliza apenas a data exibida no histórico, sem modificar o documento. */
export function historyDay(value) {
  const text=String(value||'');
  if(validInsightDay(text.slice(0,10)))return text.slice(0,10);
  const match=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
  const day=match?`${match[3]}-${match[2]}-${match[1]}`:'';
  return validInsightDay(day)?day:'';
}

/** Filtra a lista carregada; não muda totais, datas ou regras de gravação. */
export function historyPeriod(entries,month,scope) {
  const prefix=scope==='year'?month.slice(0,4):month;
  return entries.filter(entry=>historyDay(entry.day).startsWith(prefix)&&prefix);
}

/** Seleciona somente um dia de emissão e preserva acesso a documentos legados sem data. */
export function documentHistory(documents,month,selectedDay) {
  const dated=documents.map(document=>({document,day:historyDay(document.date)}));
  const days=[...new Set(dated.filter(entry=>entry.day.startsWith(month)&&month).map(entry=>entry.day))].sort().reverse();
  const day=selectedDay==='unknown'?'unknown':days.includes(selectedDay)?selectedDay:'';
  return {days,day,unknown:dated.filter(entry=>!entry.day).length,
    documents:dated.filter(entry=>day==='unknown'?!entry.day:day?entry.day===day:month&&entry.day.startsWith(month)).map(entry=>entry.document)};
}
