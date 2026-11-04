import {useEffect,useState} from 'react';

// invoke uses the existing authenticated application RPC transport.
// Server inventory_user_update enforces role, tenant, last manager, session and audit.
export default function UserDirectoryEditor({users=[],user,invoke,onChanged}){
  const [selected,setSelected]=useState('');
  const [name,setName]=useState('');
  const [login,setLogin]=useState('');
  const [active,setActive]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const canManage=user?.role==='superadmin'||user?.role==='admin';
  const allowed=users.filter(x=>x.id!==user?.id&&x.role!=='superadmin'&&
    (user?.role==='superadmin'||x.role==='employee'));
  const record=allowed.find(x=>x.id===selected);
  useEffect(()=>{
    if(!record){setSelected('');return;}
    setName(record.displayName||'');setLogin(record.username||'');
    setActive(Boolean(record.active));setError('');setMessage('');
  },[record?.id,record?.displayName,record?.username,record?.active]);
  if(!canManage)return null;
  async function submit(event){
    event.preventDefault();
    if(!record||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      await invoke('inventory_user_update',{
        p_user_id:record.id,p_username:login.trim().toLowerCase(),
        p_display_name:name.trim(),p_active:active
      });
      await onChanged();
      setMessage('Cadastro atualizado. Alterações de acesso passam a valer imediatamente.');
    }catch{
      setError('Não foi possível atualizar este usuário. Verifique a permissão e tente novamente.');
    }finally{setBusy(false);}
  }
  return <section className="tenant-user-editor" aria-labelledby="edit-user-title">
    <h3 id="edit-user-title">Editar usuário existente</h3>
    <p>Altere nome, login ou situação. A senha e o perfil não são modificados.</p>
    <form onSubmit={submit}>
      <label>Usuário
        <select aria-label="Usuário para edição" value={selected}
          onChange={event=>setSelected(event.target.value)} disabled={busy}>
          <option value="">Selecione um usuário</option>
          {allowed.map(entry=><option key={entry.id} value={entry.id}>
            {entry.displayName} ({entry.username}) · {entry.role==='admin'?'Gestor':'Funcionário'}
          </option>)}
        </select>
      </label>
      {record&&<>
        <label>Nome completo
          <input name="editDisplayName" value={name} onChange={event=>setName(event.target.value)}
            maxLength={120} required disabled={busy}/>
        </label>
        <label>Login
          <input name="editUsername" value={login} onChange={event=>setLogin(event.target.value)}
            minLength={3} maxLength={64} required pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}"
            autoCapitalize="none" autoComplete="off" disabled={busy}/>
        </label>
        <label className="tenant-edit-active">
          <input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}
            disabled={busy}/> Usuário ativo
        </label>
        {!active&&<p>Ao desativar, as sessões abertas desse usuário serão encerradas.</p>}
        <button type="submit" className="btn primary" disabled={busy||
          (name===record.displayName&&login===record.username&&active===Boolean(record.active))}>
          {busy?'Salvando…':'Salvar alterações'}
        </button>
      </>}
    </form>
    {error&&<p role="alert">{error}</p>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
