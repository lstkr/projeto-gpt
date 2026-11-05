import {useEffect,useRef} from 'react';
import {businessToday} from '../lib/insight-period.mjs';
import {PERIOD_MONTHS,periodYears,openPeriodList,listenForPeriodWheel} from '../lib/period-selection.mjs';

/** Listas de mês e ano funcionam por clique, duplo clique, teclado e roda do mouse. */
export default function PeriodControls({month,scope,onChange,label='Período'}) {
  const controls=useRef(null);
  const years=periodYears(Number(businessToday().slice(0,4)));
  const year=month.slice(0,4);
  useEffect(()=>listenForPeriodWheel(controls.current),[]);
  return <div ref={controls} className="cash-chart-controls giro-period-controls">
    <div className="cash-scope-toggle" role="group" aria-label={label}>
      {['month','year'].map(value=><button type="button" key={value} aria-pressed={scope===value} className={scope===value?'is-active':''} onClick={()=>onChange({month,scope:value})}>{value==='month'?'Mês':'Ano'}</button>)}
    </div>
    <div className="giro-period-lists">
      {scope==='month'&&<label className="field"><span>Mês de referência</span><select aria-label="Mês de referência" value={month.slice(5,7)} onDoubleClick={event=>openPeriodList(event.currentTarget)} onChange={event=>onChange({scope,month:year+'-'+event.target.value})}>
        {PERIOD_MONTHS.map((name,index)=><option key={name} value={String(index+1).padStart(2,'0')}>{name}</option>)}
      </select></label>}
      <label className="field"><span>Ano de referência</span><select aria-label="Ano de referência" value={year} onDoubleClick={event=>openPeriodList(event.currentTarget)} onChange={event=>onChange({scope,month:event.target.value+month.slice(4)})}>
        {!years.includes(year)&&<option value={year} disabled>{year} (fora do intervalo)</option>}
        {years.map(value=><option key={value}>{value}</option>)}
      </select></label>
    </div>
  </div>;
}
