import {useEffect,useMemo,useRef,useState} from 'react';
import {revenueChart} from '../lib/revenue-chart.mjs';
import {insightMoney} from '../lib/cash-insights.mjs';

const label=(key,scope)=>new Date(key+(scope==='year'?'-01':'')+'T12:00:00').toLocaleDateString('pt-BR',scope==='year'?{month:'long',year:'numeric'}:{day:'2-digit',month:'long'});

/** Apresenta escala, extremos e detalhe acessível; ausências não são venda zero.
 * CL-02: até 50 linhas para manter a rolagem e a série visual no mesmo componente.
 */
export default function CashRevenueChart({entries,month,scope,onSelect}) {
  const series=useMemo(()=>revenueChart(entries,{month,scope}),[entries,month,scope]);
  const [highlight,setHighlight]=useState('');
  const viewport=useRef(null);
  const point=series.points.find(item=>item.key===highlight);
  useEffect(()=>{
    const media=window.matchMedia('(max-width:620px)');
    function position() {
      const node=viewport.current, last=node?.querySelector('[data-last-recorded="true"]');
      if(media.matches&&last)node.scrollLeft=Math.max(0,last.getBoundingClientRect().left-node.getBoundingClientRect().left+node.scrollLeft-node.clientWidth/2+last.clientWidth/2);
    }
    position();media.addEventListener('change',position);
    return ()=>media.removeEventListener('change',position);
  },[series.lastKey,month,scope]);
  return <section className="panel giro-revenue-chart" aria-label="Evolução do faturamento">
    <h2>Faturamento {scope==='year'?'mensal':'diário'} — {scope==='year'?month.slice(0,4):label(month,'year')}</h2>
    <div className="giro-chart-extremes">{[['Maior',series.max],['Menor',series.min]].map(([title,item])=><div key={title}><span>{title} {scope==='year'?'mês':'dia'} registrado</span><b>{item?insightMoney(item.cents):'Sem registros'}</b><small>{item?label(item.key,scope):'—'}</small></div>)}</div>
    <p className="cash-chart-inspector" role="status" aria-live="polite" data-testid="cash-chart-inspector">{point?`${label(point.key,scope)} · ${insightMoney(point.cents)}`:'Selecione uma coluna para detalhar. Dias sem registro não comprovam venda zero.'}</p>
    {series.invalid>0&&<p role="status">Série parcial: {series.invalid} fechamento(s) inválidos fora do gráfico.</p>}
    <p className="giro-chart-hint" id="chart-scroll-hint">↔ Deslize para ver {scope==='year'?'os meses':'os dias'}. Último registro posicionado na tela.</p>
    <div className="giro-chart-layout"><div className="giro-chart-axis" aria-hidden="true">{[series.ceiling,series.ceiling/2n,0n].map((value,index)=><span key={index}>{insightMoney(value)}</span>)}</div>
      <div ref={viewport} className="giro-chart-scroll" role="region" aria-label="Gráfico de faturamento com rolagem horizontal" tabIndex={0} aria-describedby="chart-scroll-hint">
        <div className="giro-revenue-bars">{series.points.map(item=><button type="button" className="cash-bar-column" key={item.key} data-last-recorded={item.key===series.lastKey} disabled={!item.recorded} aria-label={`${label(item.key,scope)}, ${item.recorded?insightMoney(item.cents):'sem fechamento registrado'}`} onFocus={()=>setHighlight(item.key)} onMouseEnter={()=>setHighlight(item.key)} onMouseLeave={()=>setHighlight('')} onBlur={()=>setHighlight('')} onClick={()=>onSelect(item.key)}>
          <span className="giro-chart-track"><i style={{height:item.recorded?`${Number(item.cents*10000n/series.ceiling)/100}%`:'0%'}}/></span><small>{scope==='year'?label(item.key,scope).split(' de ')[0].slice(0,3):item.key.slice(-2)}</small>
        </button>)}</div>
      </div>
    </div>
  </section>;
}
