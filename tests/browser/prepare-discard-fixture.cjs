const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'pages/index.js'), 'utf8');
const handlers = ['discardReceiptReview', 'requestDiscardReceiptReview'].map(name => {
  const match = source.match(new RegExp('function ' + name + '\\(\\) \\{[\\s\\S]*?^  \\}', 'm'));
  if (!match) throw new Error('Handler ausente: ' + name);
  return match[0];
}).join('\n');

// Gerada apenas no runner isolado: não existe no código publicado da aplicação.
fs.writeFileSync(path.join(root, 'pages/__qa_discard.js'), `
import { useRef, useState } from 'react';
import DiscardReceiptDialog from '../components/DiscardReceiptDialog';
import { useAccessibleDialog } from '../components/useAccessibleDialog';
export default function DiscardFixture() {
  const [draft, setDraft] = useState({name:'Nota sintética'});
  const [draftQueue, setDraftQueue] = useState([]);
  const [discardReceiptOpen, setDiscardReceiptOpen] = useState(false);
  const [, setDraftBatch] = useState(null);
  const [, setError] = useState('');
  const uploadRef = useRef(null);
  useAccessibleDialog(discardReceiptOpen ? 'discard-receipt' : '', () => setDiscardReceiptOpen(false));
  ${handlers}
  return <div className="shell"><main className="main">
    <button onClick={() => {setDraft({name:'Nota sintética'});setDraftQueue([]);}}>Uma nota</button>
    <button onClick={() => {setDraft({name:'Nota sintética'});setDraftQueue([{}]);}}>Várias notas</button>
    {draft && <section aria-label="Conferência">
      <input aria-label="Texto da nota" value={draft.name} onChange={event => setDraft({name:event.target.value})}/>
      <button aria-label="Fechar conferência" onClick={requestDiscardReceiptReview}>X</button>
      <button onClick={() => {setDraft(null);setDraftQueue([]);setDraftBatch(null);setError('');}}>Cancelar</button>
    </section>}
  </main>{discardReceiptOpen && <DiscardReceiptDialog queuedCount={draftQueue.length}
    onCancel={() => setDiscardReceiptOpen(false)} onConfirm={discardReceiptReview}/>}</div>;
}
`);
