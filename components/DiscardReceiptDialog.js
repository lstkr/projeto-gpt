/** Substitui apenas a confirmação nativa de descarte da fila de conferência. */
export default function DiscardReceiptDialog({ queuedCount, onCancel, onConfirm }) {
  return <div className="overlay" onMouseDown={event => {
    if (event.target === event.currentTarget) onCancel();
  }}>
    <section className="modal compact" role="dialog" aria-modal="true" aria-labelledby="discard-receipt-title">
      <div className="modal-heading">
        <h2 id="discard-receipt-title">Descartar esta nota e os {queuedCount} documentos aguardando revisão?</h2>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn secondary" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn primary" onClick={onConfirm}>OK</button>
      </div>
    </section>
  </div>;
}
