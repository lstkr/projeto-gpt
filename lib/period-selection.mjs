export const PERIOD_LOOKBACK_YEARS=10;
export const PERIOD_MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

/** Lista o ano corrente e os dez anteriores; relógio é fornecido pela interface. */
export function periodYears(currentYear) {
  return Array.from({length:PERIOD_LOOKBACK_YEARS+1},(_,index)=>String(currentYear-index));
}

/** Abre a lista nativa quando disponível, mantendo foco e seleção padrão nos demais navegadores. */
export function openPeriodList(control) {
  try { control.showPicker?.(); }
  catch { control.focus(); }
}

/** Roda apenas no seletor focado; a rolagem do restante da página fica livre. */
export function listenForPeriodWheel(container) {
  function wheel(event) {
    const control=event.target;
    if(control.tagName!=='SELECT'||control.ownerDocument.activeElement!==control||!event.deltaY)return;
    event.preventDefault();
    const index=control.selectedIndex+(event.deltaY>0?1:-1);
    const option=control.options[index];
    if(!option||option.disabled)return;
    control.value=option.value;
    control.dispatchEvent(new Event('change',{bubbles:true}));
  }
  container.addEventListener('wheel',wheel,{passive:false});
  return ()=>container.removeEventListener('wheel',wheel);
}
