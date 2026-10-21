export const CASH_CHANNELS = [
  ['cartaoCredito','Cartão crédito (POS)'],
  ['cartaoDebito','Cartão débito (POS)'],
  ['credito','Crédito'],
  ['debito','Débito'],
  ['outras','Outras / PIX'],
  ['dinheiroVendas','Dinheiro (vendas)']
];
export function cashAmount(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/R\$/g,'').replace(/\s/g,'');
    value = trimmed.includes(',') ? trimmed.replace(/\./g,'').replace(',','.') : trimmed;
  }
  const number=Number(value);
  return Number.isFinite(number) && number>=0 ? Math.round(number*100)/100 : NaN;
}
export function cashTotals(entry) {
  const revenues=Object.fromEntries(CASH_CHANNELS.map(([key])=>[key,cashAmount(entry[key]??0)]));
  const movements=(entry.movements||[]).map(m=>({...m,amount:cashAmount(m.amount)}));
  const inflow=movements.filter(m=>m.type==='suprimento').reduce((s,m)=>s+m.amount,0);
  const outflow=movements.filter(m=>m.type==='sangria').reduce((s,m)=>s+m.amount,0);
  const revenue=Object.values(revenues).reduce((s,n)=>s+n,0);
  return {revenues, movements, revenue:Math.round(revenue*100)/100,
    pos:Math.round((revenues.cartaoCredito+revenues.cartaoDebito)*100)/100,
    inflow:Math.round(inflow*100)/100,outflow:Math.round(outflow*100)/100,
    cashExpected:Math.round((revenues.dinheiroVendas+inflow-outflow)*100)/100};
}
export function validateCashClosing(entry){
  const errors=[];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(entry.day||'') ||
     Number.isNaN(new Date(entry.day+'T12:00:00').getTime())) errors.push('Data inválida');
  if(!String(entry.operator||'').trim()) errors.push('Informe o operador');
  if(!String(entry.register||'').trim()) errors.push('Informe o número do caixa');
  if((entry.movements||[]).some(m=>!['suprimento','sangria'].includes(m.type) || !String(m.reason||'').trim()))
    errors.push('Informe tipo e motivo das movimentações');
  const totals=cashTotals(entry);
  if(Object.values(totals.revenues).some(n=>!Number.isFinite(n)) ||
    totals.movements.some(m=>!Number.isFinite(m.amount))) errors.push('Valores monetários inválidos');
  if(totals.cashExpected < -0.005) errors.push('Sangrias excedem os valores em dinheiro disponíveis');
  if(entry.cashCounted!=='' && entry.cashCounted!=null &&
    !Number.isFinite(cashAmount(entry.cashCounted))) errors.push('Valor físico informado inválido');
  return errors;
}
export function aggregateCashMonthly(entries,year,month){
  const prefix=year+'-'+String(month).padStart(2,'0')+'-';
  const filtered=(entries||[]).filter(e=>e.day?.startsWith(prefix));
  const daily=new Map();
  for(const entry of filtered) {
    const data=cashTotals(entry);
    if(!Number.isFinite(data.revenue)) continue;
    daily.set(entry.day,(daily.get(entry.day)||0)+data.revenue);
  }
  return {daily:[...daily].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,value])=>({day,revenue:Math.round(value*100)/100})),
    revenue:Math.round([...daily.values()].reduce((a,b)=>a+b,0)*100)/100,
    count:filtered.length};
}
