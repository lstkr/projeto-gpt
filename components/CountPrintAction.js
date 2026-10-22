import {useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useAccessibleDialog} from './useAccessibleDialog';
import {buildCountSheet} from '../lib/count-print-view.mjs';
import {countPrintHtml} from '../lib/count-print.mjs';

export default function CountPrintAction({products,latestCount,user,unitName}){
  const [paper,setPaper]=useState('a4');
  const [mode,setMode]=useState('blind');
  const [open,setOpen]=useState(false);
  const [ready,setReady]=useState(false);
  const frame=useRef(null);
  const canDifferences=user?.role==='admin'&&Array.isArray(latestCount?.items)&&latestCount.items.length>0;
  const effectiveMode=mode==='differences'&&canDifferences?'differences':'blind';
  const sheet=useMemo(()=>buildCountSheet({
    products,latestCount,user,unitName,mode:effectiveMode,paper
  }),[products,latestCount,user,unitName,effectiveMode,paper]);
  useAccessibleDialog(open?'count-print-preview':null,()=>setOpen(false));

  function printPreview(){
    if(!ready||!frame.current?.contentWindow)return;
    frame.current.contentWindow.focus();
    frame.current.contentWindow.print();
  }

  return <section className="count-print-actions" aria-label="Impressão da contagem">
    <h3>Imprimir contagem</h3>
    <p>A impressão é auxiliar. Ela não registra conferência nem altera o estoque.</p>
    <div className="count-print-controls">
      <label>Formato do papel
        <select aria-label="Formato do papel de contagem" value={paper}
          onChange={event=>setPaper(event.target.value)}>
          <option value="a4">A4 · impressora comum</option>
          <option value="thermal58">Térmica · 58 mm</option>
          <option value="thermal80">Térmica · 80 mm</option>
        </select>
      </label>
      <label>Tipo de documento
        <select aria-label="Tipo de documento de contagem" value={effectiveMode}
          onChange={event=>setMode(event.target.value)}>
          <option value="blind">Contagem cega (sem saldos teóricos)</option>
          {canDifferences&&<option value="differences">Última conferência · divergências</option>}
        </select>
      </label>
      <button type="button" className="btn secondary" disabled={!products?.length}
        onClick={()=>{setReady(false);setOpen(true);}}>Abrir prévia de impressão</button>
    </div>
    {open&&createPortal(<div className="overlay" onMouseDown={event=>{
      if(event.target===event.currentTarget)setOpen(false);
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="count-print-title"
        className="modal count-print-modal" tabIndex={-1}>
        <h2 id="count-print-title">Prévia de impressão — {paper==='a4'?'A4':paper==='thermal58'?'58 mm':'80 mm'}</h2>
        <p>{effectiveMode==='blind'?'Contagem cega: o documento não apresenta saldos teóricos.':
          'Relatório baseado na última contagem concluída.'}</p>
        <div className="count-print-preview-scroll">
          <iframe ref={frame} title="Documento da contagem para impressão"
            srcDoc={countPrintHtml(sheet)} onLoad={()=>setReady(true)}
            className={'count-print-frame count-print-'+paper}/>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={()=>setOpen(false)}>Fechar prévia</button>
          <button type="button" className="btn primary" disabled={!ready} onClick={printPreview}>Imprimir documento</button>
        </div>
      </section>
    </div>,document.body)}
  </section>;
}
