// Map PIX to the existing "Outras" category until the database and UI
// introduce a dedicated PIX field. Dinheiro from NFC-e is sales, not change
// or a manual cash movement.
const CHANNELS=[
 ['cartaoCredito',/^\s*[^A-ZÀ-ÿ0-9]{0,3}(?:(?:\(\s*\+\s*\)|\+)\s*)?(?:C?ART[AÃ]O)\s*(?:DE\s+)?CR[EÉ]DITO\b/i],
 ['cartaoDebito',/^\s*[^A-ZÀ-ÿ0-9]{0,3}(?:(?:\(\s*\+\s*\)|\+)\s*)?(?:C?ART[AÃ]O)\s*(?:DE\s+)?D[EÉ]BITO\b/i],
 ['credito',/^\s*[^A-ZÀ-ÿ0-9]{0,3}(?:(?:\(\s*\+\s*\)|\+)\s*)?C?R[EÉ]DITO\b/i],
 ['debito',/^\s*[^A-ZÀ-ÿ0-9]{0,3}(?:(?:\(\s*\+\s*\)|\+)\s*)?D?E[B8]ITO\b/i],
 ['dinheiroVendas',/^\s*[^A-ZÀ-ÿ0-9]{0,3}(?:(?:\(\s*\+\s*\)|\+)\s*)?D?INHEIRO\b/i],
 ['outras',/^\s*[^A-ZÀ-ÿ0-9]{0,3}(?:(?:\(\s*\+\s*\)|\+)\s*)?(?:O?UTRAS|PIX)\b/i],
];
// PDF.js can expose payment rows as "R$ 462,50 (+)CARTAO CREDITO"
// instead of "(+)CARTAO CREDITO R$ 462,50".
const amountFirst=/^\s*((?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2})\s+(.+)$/i;
const paymentRow=(line)=>{
 const match=line.match(amountFirst);
 return match ? match[2]+' '+match[1] : line;
};
const asNumber=(s)=>Number(String(s).replace(/\./g,'').replace(',','.'));
const values=(s)=>[...String(s||'').matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/gi)].map(m=>asNumber(m[1]));
const dateIso=s=>{const m=String(s).match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?m[3]+'-'+m[2]+'-'+m[1]:'';};
export function parseCashReport(text){
 const full=String(text||'').replace(/\r/g,'');
 const lines=full.split('\n').map(x=>x.trim()).filter(Boolean);
 const report={source:'Arquivo de fechamento (não verificado)',day:'',register:'',operator:'',
 cartaoCredito:'0',cartaoDebito:'0',credito:'0',debito:'0',outras:'0',
 dinheiroVendas:'0',cashCounted:'',movements:[],importWarnings:[]};
 const originalDate=full.match(/(?:Caixa\s+do\s+dia|do\s+dia|dia)\s*:?\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i)||
   full.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4})/);
 report.day=dateIso(originalDate?.[1]);
 report.register=full.match(/Caixa\s+N[°ºo.]?\s*:?\s*([0-9A-Za-z-]+)/i)?.[1]||
   full.match(/(?:Caixa|xa)\s+N[°ºo.]?\s*:?\s*([0-9]{1,4})/i)?.[1]||'';
 report.operator=full.match(/Operador\s*:\s*([^\n]+)/i)?.[1]?.trim()||'';
 const sections={};
 let section='';
 for(const line of lines){
  // PDF.js output can include extra spacing between NFC, the dash and "e".
  if(/^(?:NFC\s*[-–]?\s*e\b|Vendas\s+NFC\s*[-–]?\s*e\b|Faturamento\s+por\s+modalidade\b)/i.test(line)){
   section='sales';sections[section] ||= [];continue;
  }
  if(/^Movimenta[cç][oõ]es\s+Manuais\b/i.test(line)){section='moves';sections[section]=[];continue;}
  if(/^Caixa\s+Digital\b/i.test(line)){section='digital';continue;}
  if(/^Caixa\s+F[ií]sico\b/i.test(line)){section='physical';continue;}
  if(section==='sales'||section==='moves')sections[section].push(line);
 }
 const firstDigital=lines.findIndex(line=>/digital\b/i.test(line));
 const firstMoves=lines.findIndex(line=>/movimenta[cç][oõ]es|manuais/i.test(line));
 let sales=sections.sales||[];
 if(!sales.length){
  const limit=[firstDigital,firstMoves].filter(index=>index>=0).reduce((min,index)=>Math.min(min,index),lines.length);
  const start=lines.slice(0,limit).findIndex(line=>CHANNELS.some(([,regex])=>regex.test(paymentRow(line)))&&!/^\s*Total\s+em\b/i.test(line));
  if(start>=0)sales=lines.slice(start,limit);
 }
 let recognizedChannels=0;
 let pixCents=0;
 for(let index=0;index<sales.length;index++){
  const normalized=paymentRow(sales[index]);
  const channel=CHANNELS.find(([,regex])=>regex.test(normalized));
  if(!channel)continue;
  const [key]=channel;
  let amount=values(normalized)[0];
  // On some text-based PDFs, a payment label and its amount occupy
  // consecutive rows. Do not read arbitrary numbers on adjacent lines.
  if(!Number.isFinite(amount) && /^(?:R\$\s*)?\d[\d.]*,\d{2}$/.test(sales[index+1]||''))
   amount=values(sales[++index])[0];
  if(!Number.isFinite(amount))continue;
  // Integer cents avoid floating-point drift when PIX and OUTRAS coexist.
  const cents=Math.round(Number(report[key]||0)*100)+Math.round(amount*100);
  report[key]=(cents/100).toFixed(2);
  if(/^\s*\(?\+\)?\s*PIX\b/i.test(normalized))pixCents+=Math.round(amount*100);
  recognizedChannels++;
 }
 if(pixCents)report.importWarnings.push(
  'Vendas PIX (R$ '+(pixCents/100).toFixed(2).replace('.',',')+
  ') foram incluídas em Outras, pois o formulário atual não possui campo PIX separado.');
 // Only the NFC-e section represents revenue; digital calculator rows duplicate it.
 const official=sales.find(x=>/^\s*(?:\(\s*=\s*\)\s*)?Total\b/i.test(x)&&!/Cart[aã]o/i.test(x));
 const reportedTotal=official?values(official)[0]:null;
 const calculated=CHANNELS.reduce((s,[key])=>s+Number(report[key]||0),0);
 if(!sales.length)report.importWarnings.push('Seção de faturamento NFC-e não localizada.');
 else if(!recognizedChannels)report.importWarnings.push('Nenhuma modalidade de faturamento reconhecida: preencha os valores manualmente.');
 if(reportedTotal==null)report.importWarnings.push('Total de faturamento não localizado: confira manualmente.');
 else if(Math.abs(calculated-reportedTotal)>0.02)report.importWarnings.push(
 'Total impresso ('+reportedTotal.toFixed(2)+') não confere com formas de pagamento ('+calculated.toFixed(2)+').');
 report.reportedTotal=reportedTotal;
 report.reportedPos=values(sales.find(x=>/Total em Cart[aã]o\/POS/i.test(x)))[0]??null;
 let moves=sections.moves||[];
 if(!moves.length){
  const limit=[firstDigital,lines.findIndex(line=>/f[ií]sico\b/i.test(line))].filter(index=>index>=0).reduce((min,index)=>Math.min(min,index),lines.length);
  const reasonIndex=lines.slice(0,limit).findIndex(line=>/\b(?:SUPRIMENTO|SANGRIA)\b/i.test(line));
  if(reasonIndex>=0){
   let start=reasonIndex;
   while(start>0&&!/DINHEIRO/i.test(lines[start]))start--;
   moves=lines.slice(start,limit);
  }
 }
 for(let i=0;i<moves.length;i++){
  const line=moves[i];
  const sign=line.match(/^\s*[^A-ZÀ-ÿ0-9]{0,3}\(?([+-])?\)?\s*D?INHEIRO/i);
  if(!sign)continue;
  const amount=values(line)[0];
  if(!Number.isFinite(amount))continue;
  const after=[];
  for(let j=i+1;j<moves.length;j++){
   const next=moves[j];
   if(/^\s*[^A-ZÀ-ÿ0-9]{0,3}\(?[+-]?\)?\s*D?INHEIRO/i.test(next))break;
   if(/^(?:Esp[eé]cie|Valor)$/i.test(next))continue;
   after.push(next);
  }
  const reasonText=after.join(' ').replace(/^Motivo:\s*/i,'').trim();
  const indicated=/\b(SUPRIMENTO|SANGRIA)\b/i.exec(reasonText)?.[1]?.toLowerCase();
  const type=indicated|| (sign[1]==='+'?'suprimento':sign[1]==='-'?'sangria':'');
  if(!type)continue;
  if(sign[1]&&((type==='suprimento')!==(sign[1]==='+')))report.importWarnings.push('Sinal e tipo de movimentação divergentes.');
  if(!/^SANGRIA\s*-\s*FECHAMENTO\s+DE\s+CAIXA\b/i.test(reasonText))
   report.movements.push({type,amount:amount.toFixed(2),reason:reasonText||'Conferir motivo no documento'});
  i+=after.length;
 }
 if(!report.movements.length)report.importWarnings.push('Nenhuma movimentação manual identificada.');
 if(!report.day||!report.register||!report.operator)report.importWarnings.push('Confira data, caixa e operador.');
 report.requiresReview=true;
 return report;
}

