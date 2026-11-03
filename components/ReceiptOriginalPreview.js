import { useState } from 'react';
import { useReceiptOriginal } from './useReceiptOriginal';
import ReceiptPdfPreview from './ReceiptPdfPreview';

/** Mantém o original junto à conferência, usando o serviço autenticado fornecido pelo chamador. */
export default function ReceiptOriginalPreview({receiptId,loadOriginal}) {
  const [retry,setRetry] = useState(0);
  const [expanded,setExpanded] = useState(false);
  const result = useReceiptOriginal({receiptId,loadOriginal,retry});
  return <aside className={'panel giro-original'+(expanded?' is-expanded':'')} aria-label="Documento original para conferência">
    <div className="panel-head"><h2>Documento original</h2><button type="button" className="btn secondary giro-original-expand" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Recolher':'Expandir'}</button></div>
    {!receiptId ? <p className="original-state">Nota digitada manualmente. Não há arquivo anexado.</p> :
      result.status === 'loading' ? <p className="original-state" role="status">Carregando o original…</p> :
      result.status === 'error' ? <div className="original-state" role="status"><p>Não foi possível abrir o original. A conferência continua disponível.</p><button className="btn secondary" type="button" onClick={() => setRetry(value => value+1)}>Tentar novamente</button></div> : <OriginalContent file={result.file}/>}
  </aside>;
}

function OriginalContent({file}) {
  const [imageError,setImageError] = useState(false);
  return <>
    {file.kind === 'xml' ? <pre aria-label="XML original como texto">{file.text}</pre> :
      file.kind === 'pdf' ? <ReceiptPdfPreview key={file.url} file={file}/> : imageError ?
        <p className="original-state" role="status">A imagem não pôde ser exibida. Use o download do original.</p> :
        <img src={file.url} alt="Imagem original da nota para confrontar com os itens" onError={() => setImageError(true)}/>}
    <footer><a href={file.url} download={file.fileName}>Baixar original</a></footer>
  </>;
}
