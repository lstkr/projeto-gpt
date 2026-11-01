import { CASH_CHANNELS } from '../lib/cash-closing.mjs';

function Snapshot({ entry }) {
  if (!entry) return <p>Registro anterior indisponível.</p>;
  return <dl>
    <dt>Operador</dt><dd>{entry.operator}</dd>
    {[...CASH_CHANNELS, ['cashCounted', 'Dinheiro contado']].map(([key, label]) =>
      <div key={key}><dt>{label}</dt><dd>R$ {String(entry[key] ?? '0.00').replace('.', ',')}</dd></div>)}
    <dt>Movimentações</dt><dd>{entry.movements?.length ? <ul>{entry.movements.map((movement, index) =>
      <li key={index}>{movement.type}: R$ {String(movement.amount).replace('.', ',')} — {movement.reason}</li>)}</ul> : 'Nenhuma'}</dd>
  </dl>;
}

/** Exibe somente os snapshots financeiros autorizados pelo contrato de auditoria. */
export default function CashCorrectionHistory({ history, onReload }) {
  return <section aria-label="Histórico de correções">
    <h3>Histórico de correções</h3>
    {history.loading && <p role="status">Carregando histórico…</p>}
    {history.error && <p role="alert">{history.error} <button type="button" onClick={onReload}>Tentar novamente</button></p>}
    {!history.loading && !history.error && !history.entries.length && <p>Nenhuma correção registrada.</p>}
    {history.entries.map((correction) => <details key={correction.id}>
      <summary>Revisão {correction.revision} · {correction.actor?.displayName || 'Autoria não disponível'} · {correction.createdAt}</summary>
      <p><b>Motivo:</b> {correction.reason}</p>
      <h4>Antes</h4><Snapshot entry={correction.before}/>
      <h4>Depois</h4><Snapshot entry={correction.after}/>
    </details>)}
  </section>;
}
