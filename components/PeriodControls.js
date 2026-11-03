/** Mantém os controles no mesmo espaço ao alternar entre mês e ano. */
export default function PeriodControls({month,scope,onChange,years,label='Período'}) {
  return <div className="cash-chart-controls giro-period-controls">
    <div className="cash-scope-toggle" role="group" aria-label={label}>
      {['month','year'].map(value=><button type="button" key={value} aria-pressed={scope===value} className={scope===value?'is-active':''} onClick={()=>onChange({month,scope:value})}>{value==='month'?'Mês':'Ano'}</button>)}
    </div>
    <label className="field"><span>{scope==='month'?'Mês de referência':'Ano de referência'}</span>
      {scope==='month'?<input type="month" value={month} onChange={event=>onChange({scope,month:event.target.value})}/>:
        <select value={month.slice(0,4)} onChange={event=>onChange({scope,month:event.target.value+month.slice(4)})}>{[...new Set([month.slice(0,4),...years.map(String)])].filter(Boolean).sort().reverse().map(year=><option key={year}>{year}</option>)}</select>}
    </label>
  </div>;
}
