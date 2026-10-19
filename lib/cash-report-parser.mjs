const CHANNELS=[
 ['cartaoCredito',/^\s*\(?\+\)?\s*CART[AÃ]O\s*CR[EÉ]DITO\b/i],
 ['cartaoDebito',/^\s*\(?\+\)?\s*CART[AÃ]O\s*D[EÉ]BITO\b/i],
 ['credito',/^\s*\(?\+\)?\s*CR[EÉ]DITO\b/i],
 ['debito',/^\s*\(?\+\)?\s*D[EÉ]BITO\b/i],
 ['outras',/^\s*\(?\+\)?\s*OUTRAS\b/i],
];
const asNumber=(s)=>Number(String(s).replace(/\./g,'').replace(',','.'));
const values=(s)=>[...String(s||'').matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi)].map(m=>asNumber(m[1]));
const dateIso=s=>{const m=String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?m[3]+'-'+m[2]+'-'+m[1]:'';};
export function parseCashReport(text){
 const full=String(text||'').replace(/\r/g,'');
 const lines=full.split('\n').map(x=>x.trim()).filter(Boolean);
 const report={source:'Arquivo de fechamento (não verificado)',day:'',register:'',operator:'',
 cartaoCredito:'0',cartaoDebito:'0',credito:'0',debito:'0',outras:'0',
 dinheiroVendas:'0',cashCounted:'',movements:[],importWarnings:[]};
 const originalDate=full.match(/Caixa\s+do\s+dia\s*:\s*([0-9/]+)/i);
 report.day=dateIso(originalDate?.[1]);
 report.register=full.match(/Caixa\s+N[°ºo.]?\s*:\s*([0-9A-Za-z-]+)/i)?.[1]||'';
 report.operator=full.match(/Operador\s*:\s*([^\n]+)/i)?.[1]?.trim()||'';
 const sections={};
 let section='';
 for(const line of lines){
  if(/^NFC[- ]?e\b/i.test(line)){section='sales';sections[section]=[];continue;}
  if(/^Movimenta[cç][oõ]es\s+Manuais\b/i.test(line)){section='moves';sections[section]=[];continue;}
  if(/^Caixa\s+Digital\b/i.test(line)){section='digital';continue;}
  if(/^Caixa\s+F[ií]sico\b/i.test(line)){section='physical';continue;}
  if(section==='sales'||section==='moves')sections[section].push(line);
 }
 const sales=sections.sales||[];
 for(const [key,regex] of CHANNELS){
  const line=sales.find(x=>regex.test(x));
  if(line){const n=values(line)[0];if(Number.isFinite(n))report[key]=n.toFixed(2);}
 }
 // Only the NFC-e section represents revenue; digital calculator rows duplicate it.
 const official=sales.find(x=>/^\(?=\)?\s*Total\b/i.test(x)&&!/Cart[aã]o/i.test(x));
 const reportedTotal=official?values(official)[0]:null;
 const calculated=CHANNELS.reduce((s,[key])=>s+Number(report[key]||0),0);
 if(!sales.length)report.importWarnings.push('Seção de faturamento NFC-e não localizada.');
 if(reportedTotal==null)report.importWarnings.push('Total de faturamento não localizado: confira manualmente.');
 else if(Math.abs(calculated-reportedTotal)>0.02)report.importWarnings.push(
 'Total impresso ('+reportedTotal.toFixed(2)+') não confere com formas de pagamento ('+calculated.toFixed(2)+').');
 report.reportedTotal=reportedTotal;
 report.reportedPos=values(sales.find(x=>/Total em Cart[aã]o\/POS/i.test(x)))[0]??null;
 const moves=sections.moves||[];
 for(let i=0;i<moves.length;i++){
  const line=moves[i];
  const sign=line.match(/^\(?([+-])\)?\s*DINHEIRO/i);
  if(!sign)continue;
  const amount=values(line)[0];
  if(!Number.isFinite(amount))continue;
  const after=[];
  for(let j=i+1;j<moves.length;j++){
   const next=moves[j];
   if(/^\(?[+-]\)?\s*DINHEIRO/i.test(next))break;
   if(/^(?:Esp[eé]cie|Valor)$/i.test(next))continue;
   after.push(next);
  }
  const reasonText=after.join(' ').replace(/^Motivo:\s*/i,'').trim();
  const indicated=/\b(SUPRIMENTO|SANGRIA)\b/i.exec(reasonText)?.[1]?.toLowerCase();
  const type=indicated|| (sign[1]==='+'?'suprimento':'sangria');
  if((type==='suprimento')!==(sign[1]==='+'))report.importWarnings.push('Sinal e tipo de movimentação divergentes.');
  report.movements.push({type,amount:amount.toFixed(2),reason:reasonText||'Conferir motivo no documento'});
  i+=after.length;
 }
 if(!report.movements.length)report.importWarnings.push('Nenhuma movimentação manual identificada.');
 if(!report.day||!report.register||!report.operator)report.importWarnings.push('Confira data, caixa e operador.');
 report.requiresReview=true;
 return report;
}
