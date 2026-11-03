import { useMemo } from 'react';
import { cashInsights, insightMoney } from '../lib/cash-insights.mjs';
import { operationsInsights } from '../lib/operations-insights.mjs';
import { insightPeriod, businessToday } from '../lib/insight-period.mjs';
import { CASH_CHANNELS } from '../lib/cash-closing.mjs';

const dayLabel = day => day.split('-').reverse().join('/');
const periodLabel = period => `${dayLabel(period.start)} a ${dayLabel(period.end)}`;
const variationLabel = value => value === null ? 'Sem base comparável' :
  `${value < 0n ? '−' : '+'}${String((value < 0n ? -value : value)/100n)},${String((value < 0n ? -value : value)%100n).padStart(2,'0')}% sobre os registros anteriores`;

/** Visão gerencial somente leitura; a sessão e a unidade continuam autorizadas pelos RPCs existentes. */
export default function GiroManagerInsights({entries,products,documents,month,scope,status}) {
  const today = businessToday();
  const period = useMemo(() => insightPeriod({month,scope,today}),[month,scope,today]);
  const sales = useMemo(() => period && status === 'ready' ? cashInsights(entries,period) : null,[entries,period,status]);
  const operation = useMemo(() => period ? operationsInsights({products,documents,period}) : null,[products,documents,period]);
  if (!period) return <p role="status">Escolha um período válido para consultar os indicadores.</p>;
  if (status !== 'ready') return <section className="panel giro-insights"><div className="panel-head"><h2>Visão do gestor</h2></div><p className="insight-note" role="status">{status === 'error' ? 'Não foi possível carregar os fechamentos. Os indicadores não foram calculados; entre novamente para tentar carregar os dados.' : 'Carregando os fechamentos para calcular os indicadores…'}</p></section>;
  return <section className="panel giro-insights" aria-labelledby="giro-insights-title">
    <div className="panel-head"><div><h2 id="giro-insights-title">Visão do gestor</h2><p>{periodLabel(period)} · {sales.days} dia(s) com fechamento · {sales.count} registro(s)</p></div></div>
    <div className="giro-insight-grid">
      <article><h3>Vendas registradas{sales.invalid || sales.invalidDates ? ' · parcial' : ''}</h3><strong>{sales.count ? insightMoney(sales.revenue) : 'Sem registros'}</strong><small>{variationLabel(sales.variation)}</small></article>
      <article><h3>Média por dia com fechamento</h3><strong>{insightMoney(sales.average)}</strong><small>Usa apenas dias com registro. Não é ticket médio.</small></article>
      <article><h3>Diferenças no dinheiro contado</h3><strong>{sales.count > sales.withoutCount ? insightMoney(sales.shortage) : 'Sem contagens'}</strong><small>Faltas · sobras: {sales.count > sales.withoutCount ? insightMoney(sales.surplus) : 'sem dados'}<br/>{sales.count-sales.withoutCount} de {sales.count} fechamentos conciliáveis</small></article>
    </div>
    <div className="giro-operations">
      <article><h3>Compras por notas registradas{operation.unknownInvoices ? ' · parcial' : ''}</h3><strong>{operation.purchaseCount ? insightMoney(operation.purchases) : 'Sem notas no período'}</strong><p>{operation.purchaseCount} nota(s), pela data de emissão. {operation.unknownInvoices > 0 && `${operation.unknownInvoices} nota(s) sem data/total confiável fora do cálculo. `}Não representa pagamentos ou CMV.</p></article>
      <article><h3>Estoque atual a custo cadastrado</h3><strong>{insightMoney(operation.stock)}{operation.stockUnknown ? ' · parcial' : ''}</strong><p>{operation.products} produtos · {operation.low} no mínimo ou abaixo. Retrato atual, não estoque histórico do período.</p></article>
    </div>
    <InsightDetails sales={sales} operation={operation} period={period}/>
  </section>;
}

function InsightDetails({sales,operation,period}) {
  const incomplete = sales.invalid+sales.invalidDates+sales.previousInvalid+sales.withoutCount+operation.unknownInvoices+operation.stockUnknown;
  return <details><summary>Modalidades, comparação e qualidade dos dados{incomplete ? ' · há dados incompletos' : ''}</summary>
    <p>Anterior: {dayLabel(period.previousStart)} a {dayLabel(period.previousEnd)} · {insightMoney(sales.previousRevenue)}. {period.partial ? 'Período em andamento: comparação até o dia equivalente.' : 'Comparação entre períodos civis completos.'} Ausência de fechamento não prova venda zero.</p>
    <div className="giro-mix">{CASH_CHANNELS.map(([key,label]) => <div key={key}><span>{label}</span><progress aria-label={label} max="10000" value={sales.revenue ? Number(sales.channels[key]*10000n/sales.revenue) : 0}/><b>{sales.count ? insightMoney(sales.channels[key]) : 'Sem dados'}</b></div>)}</div>
    <p>Fonte: fechamentos e notas da unidade autorizada, já carregados pelo aplicativo. Sangrias e suprimentos não entram em vendas. Faltas e sobras não se compensam entre caixas.</p>
    {incomplete > 0 && <p className="insight-warning">Excluídos/sinalizados: {sales.invalid} fechamento(s) inválidos no período; {sales.previousInvalid} na base anterior; {sales.invalidDates} sem data válida; {sales.withoutCount} sem conciliação física; {operation.unknownInvoices} nota(s) sem data/total confiável; {operation.stockUnknown} custo(s)/saldo(s) indisponíveis.</p>}
    <p>Lucro e margem aguardam vendas por item, receitas e custos históricos. O valor atual do estoque não substitui o custo da mercadoria vendida.</p>
  </details>;
}
