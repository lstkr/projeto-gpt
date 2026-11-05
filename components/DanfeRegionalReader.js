import {useEffect,useRef,useState} from 'react';
import {readDanfeByRegions} from '../lib/danfe-regional-reader.mjs';

/** Releitura opcional e cancelável, isolada do upload e sem confirmação automática. */
export default function DanfeRegionalReader({file,onApply}) {
  const operation=useRef(null);
  const [state,setState]=useState({});
  useEffect(()=>()=>operation.current?.abort(),[]);
  async function read() {
    if(operation.current)return;
    const controller=new AbortController();operation.current=controller;setState({busy:true});
    try {
      const result=await readDanfeByRegions(file.url,{signal:controller.signal});
      if(!controller.signal.aborted)setState({result});
    } catch(error) {
      if(!controller.signal.aborted)setState({error:error.message||'Não foi possível reler esta DANFE.'});
    } finally {if(operation.current===controller)operation.current=null;}
  }
  function cancel() {operation.current?.abort();operation.current=null;setState({});}
  return <section className="danfe-regional-reader" aria-label="Leitura regional da DANFE">
    <p>Leitura local por regiões: cabeçalho e produtos separados. Pode levar mais tempo; não lança estoque.</p>
    <button className="btn secondary" type="button" disabled={state.busy} onClick={()=>void read()}>Ler DANFE por regiões</button>
    {state.busy&&<><p role="status">Localizando tabela e lendo duas regiões…</p><button type="button" className="btn secondary" onClick={cancel}>Cancelar leitura regional</button></>}
    {state.error&&<p role="alert">{state.error}</p>}
    {state.result&&<><p role="status">Leitura concluída. Suas edições ainda estão preservadas.</p><button type="button" className="btn secondary" onClick={()=>onApply(state.result)}>Revisar sugestões da leitura regional</button></>}
  </section>;
}
