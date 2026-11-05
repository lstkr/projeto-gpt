/** Nome exibido pela sessão carregada; a autoria obrigatória no servidor é uma etapa separada. */
export function receiptReviewerName(user) {
  // inventory_get canônico fornece username, sem id; não ampliar o contrato de autenticação.
  const identity=user?.username || user?.id;
  return typeof identity === 'string' && identity.trim() && typeof user?.display_name === 'string'
    ? user.display_name.trim() : '';
}

/** Troca de nota ou sessão exige nova confirmação, sem reutilizar um nome digitado no rascunho. */
export function resetReceiptReviewer(draft, user) {
  return draft ? {...draft, checkedBy: receiptReviewerName(user), finalReviewed: false} : null;
}

/** Impede o fluxo normal da tela de confirmar um rascunho associado a outro nome. */
export function receiptReviewerMatches(draft, user) {
  const name = receiptReviewerName(user);
  return Boolean(name && draft?.checkedBy === name);
}
/** Identidade local da edição; arquivamento e renomeação não criam outra nota. */
export function withLocalReceiptId(draft, createId = () => crypto.randomUUID()) {
  if (!draft) return null;
  return {...draft, localReceiptId: draft.localReceiptId || createId()};
}
