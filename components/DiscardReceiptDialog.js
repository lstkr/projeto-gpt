/** Confirma o fechamento da conferência sem cancelar documentos no servidor. */
export default function DiscardReceiptDialog({ queuedCount, onCancel, onConfirm }) {
  return <div className="overlay" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <section className="modal compact" role="dialog" aria-modal="true"
      aria-labelledby="discard-receipt-title" aria-describedby="discard-receipt-description">
      <div className="modal-heading">
        <div>
          <h2 id="discard-receipt-title">Descartar esta conferência?</h2>
          <p id="discard-receipt-description">
            A conferência atual será fechada.
            {queuedCount > 0 && ` Os ${queuedCount} documentos aguardando revisão também sairão desta fila.`}
            {' '}Esta ação não exclui notas nem estorna o estoque.
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>Continuar conferindo</button>
        <button type="button" className="btn secondary text-danger" onClick={onConfirm}>Descartar conferência</button>
      </div>
    </section>
  </div>;
}
