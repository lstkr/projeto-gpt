import {CASH_CHANNELS} from './cash-closing.mjs';
import {insightCents} from './cash-insights.mjs';
import {validInsightDay} from './insight-period.mjs';

/** Série de apresentação: rubricas B1 em centavos exatos, sem alterar o fechamento. */
export function revenueChart(entries,{month,scope}) {
  if(!validInsightDay(month+'-01'))return {points:[],max:null,min:null,ceiling:100n,lastKey:'',invalid:0};
  const prefix=scope==='year'?month.slice(0,4):month, amounts=new Map();
  let invalid=0;
  for(const entry of entries) {
    if(!validInsightDay(entry?.day)||!entry.day.startsWith(prefix))continue;
    const channels=CASH_CHANNELS.map(([key])=>insightCents(Object.hasOwn(entry,key)?entry[key]:'0'));
    if(channels.some(amount=>amount===null)){invalid++;continue;}
    const key=scope==='year'?entry.day.slice(0,7):entry.day;
    amounts.set(key,(amounts.get(key)||0n)+channels.reduce((sum,amount)=>sum+amount,0n));
  }
  const length=scope==='year'?12:new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
  const points=Array.from({length},(_,index)=>{
    const key=`${prefix}-${String(index+1).padStart(2,'0')}`;
    return {key,cents:amounts.get(key)||0n,recorded:amounts.has(key)};
  });
  const recorded=points.filter(point=>point.recorded);
  const max=recorded.reduce((best,point)=>!best||point.cents>best.cents?point:best,null);
  const min=recorded.reduce((best,point)=>!best||point.cents<best.cents?point:best,null);
  const step=10n**BigInt(Math.max(2,String(max?.cents||0n).length-1));
  const ceiling=max?.cents>0n?(max.cents+step-1n)/step*step:100n;
  return {points,max,min,ceiling,lastKey:recorded.at(-1)?.key||'',invalid};
}
