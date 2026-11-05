import {cashTotals,isClosingWithdrawal} from '../lib/cash-closing.mjs';

const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value||0));

/** Exibe todas as movimentações gravadas sem somá-las ao faturamento de vendas. */
export default function CashMovementDetails({entry}) {
  const totals=cashTotals(entry);
  const movements=entry.movements||[];
  return <section className="cash-movement-details" aria-label={'Suprimentos e sangrias do caixa '+entry.register}>
    <b>Movimentações do caixa</b>
    <p>Suprimentos: {money(totals.inflow)} · Sangrias operacionais: {money(totals.outflow)}</p>
    {movements.length?<ul>{movements.map((movement,index)=><li key={movement.id||index}>
      <span><b>{isClosingWithdrawal(movement.reason)?'Retirada de fechamento':movement.type==='suprimento'?'Suprimento':'Sangria'}</b> — {movement.reason}</span>
      <strong>{money(movement.amount)}</strong>
    </li>)}</ul>:<p>Sem suprimentos ou sangrias registrados.</p>}
    <small>Movimentações de caixa não são vendas. Retirada de fechamento é apresentada separadamente das sangrias operacionais.</small>
  </section>;
}
