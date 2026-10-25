import { useEffect, useState } from 'react';
import UserDirectoryEditor from './UserDirectoryEditor';

// invoke(name, args) must use the authenticated RPC transport. The database owns
// all role/tenant checks; no password is stored in browser persistence.
export default function TenantAdministration({ invoke, user, mustChangePassword, onPasswordChanged, onTenantSelected }) {
  const [tenants, setTenants] = useState([]);
  const [activeTenantId, setActiveTenantId] = useState('');
  const [directory, setDirectory] = useState({ users: [], establishments: [] });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isDba = user?.role === 'superadmin';
  const canManage = isDba || user?.role === 'admin';

  async function load() {
    const membership = await invoke('inventory_tenants', {});
    setTenants(membership.tenants || []);
    setActiveTenantId(membership.activeTenantId || '');
    if (canManage && !mustChangePassword) setDirectory(await invoke('inventory_directory', {}));
  }
  useEffect(() => {
    let active = true;
    setBusy(true);
    Promise.resolve().then(async () => {
      const membership = await invoke('inventory_tenants', {});
      const records = canManage && !mustChangePassword ? await invoke('inventory_directory', {}) : null;
      if (!active) return;
      setTenants(membership.tenants || []);
      setActiveTenantId(membership.activeTenantId || '');
      if (records) setDirectory(records);
    }).catch(() => { if (active) setError('Não foi possível carregar os acessos. Tente novamente.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [invoke, canManage, mustChangePassword]);

  async function submit(event, operation, args, success) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (operation === 'inventory_password_change' && data.has('confirmPassword') && data.get('newPassword') !== data.get('confirmPassword')) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      await invoke(operation, args(data));
      form.reset();
      // Clear password inputs before any subsequent network request.
      if (operation === 'inventory_password_change') await onPasswordChanged();
      else { await load(); setMessage(success); }
    } catch (failure) {
      // Server error text is deliberately not echoed: a remote service could
      // include request contents. Password fields remain only in this form.
      setError('Operação não concluída. Confira os dados e suas permissões e tente novamente.');
    } finally { setBusy(false); }
  }

  if (mustChangePassword) return <section className="panel tenant-administration" aria-labelledby="password-change-title">
    <h2 id="password-change-title">Defina sua nova senha</h2><p>A senha provisória precisa ser substituída antes de continuar.</p>
    <form onSubmit={(event) => submit(event, 'inventory_password_change', (data) => ({ p_current_password: data.get('currentPassword'), p_new_password: data.get('newPassword') }), '')}>
      <label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required disabled={busy}/></label>
      <label>Nova senha (mínimo de 12 caracteres)<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy}/></label>
      <button className="btn" disabled={busy}>{busy ? 'Salvando…' : 'Alterar senha e continuar'}</button>
    </form>{error && <p role="alert">{error}</p>}
  </section>;

  return <section className="panel tenant-administration" aria-labelledby="tenant-admin-title">
    <h2 id="tenant-admin-title">{isDba ? 'Administração DBA' : canManage ? 'Configurações do gestor' : 'Configurações da conta'}</h2>
    <p>{isDba ? 'Cadastre gestores, unidades e funcionários. O acesso operacional é separado por estabelecimento.' : canManage ? 'Gerencie sua senha, estabelecimentos e funcionários vinculados à sua gestão.' : 'Atualize sua senha de acesso ao Estoque+.'}</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <section className="tenant-settings-section" aria-labelledby="own-password-title">
      <h3 id="own-password-title">Minha senha</h3>
      <p>Para alterar sua senha, informe a senha atual. Após salvar, você precisará entrar novamente.</p>
      <form onSubmit={(event) => submit(event, 'inventory_password_change', (data) => ({
        p_current_password: data.get('currentPassword'),
        p_new_password: data.get('newPassword')
      }), '')}>
        <label>Senha atual<input name="currentPassword" type="password" autoComplete="current-password" required disabled={busy}/></label>
        <label>Nova senha (12 a 72 caracteres)<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required disabled={busy}/></label>
        <label>Confirme a nova senha<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={72} required disabled={busy}/></label>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Salvando…' : 'Alterar minha senha'}</button>
      </form>
    </section>
    {!isDba && tenants.length > 0 && <form onSubmit={async (event) => {
      event.preventDefault(); if (busy) return;
      const id = new FormData(event.currentTarget).get('tenantId');
      setBusy(true); setError('');
      try { await invoke('inventory_select_tenant', { p_tenant_id: id }); await onTenantSelected(id); }
      catch { setError('Não foi possível trocar de estabelecimento. Nenhum dado de outra unidade foi carregado.'); }
      finally { setBusy(false); }
    }}><label>Estabelecimento ativo<select name="tenantId" key={activeTenantId} defaultValue={activeTenantId} disabled={busy}>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label><button className="btn" disabled={busy}>Acessar estabelecimento</button></form>}
    {canManage && <>
      <h3>Novo estabelecimento</h3>
      <form onSubmit={(event) => submit(event, 'inventory_establishment_create', (data) => ({ p_name: data.get('name') }), 'Estabelecimento cadastrado.')}>
        <label>Nome do estabelecimento<input name="name" required maxLength={120} disabled={busy}/></label><button className="btn" disabled={busy}>Cadastrar estabelecimento</button>
      </form>
      <h3>Novo usuário</h3>
      <form onSubmit={(event) => submit(event, 'inventory_user_create', (data) => ({ p_username: data.get('username'), p_display_name: data.get('displayName'), p_password: data.get('password'), p_role: isDba ? data.get('role') : 'employee', p_tenant_id: data.get('tenantId') }), 'Usuário cadastrado. A troca da senha será exigida no primeiro acesso.')}>
        <label>Nome completo<input name="displayName" required maxLength={120} autoComplete="off" disabled={busy}/></label>
        <label>Login<input name="username" required minLength={3} maxLength={80} autoComplete="off" disabled={busy}/></label>
        <label>Senha provisória (mínimo de 12 caracteres)<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" disabled={busy}/></label>
        {isDba && <label>Perfil<select name="role" disabled={busy}><option value="employee">Funcionário</option><option value="admin">Gestor</option></select></label>}
        <label>Estabelecimento<select name="tenantId" required disabled={busy}><option value="">Selecione uma unidade</option>{directory.establishments.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
        <button className="btn" disabled={busy || !directory.establishments.length}>Cadastrar usuário</button>
      </form>
      {isDba && <><h3>Vincular gestor a outra unidade</h3><form onSubmit={(event) => submit(event, 'inventory_manager_grant', (data) => ({ p_user_id: data.get('userId'), p_tenant_id: data.get('tenantId') }), 'Acesso do gestor atualizado.')}>
        <label>Gestor<select name="userId" required disabled={busy}><option value="">Selecione um gestor</option>{directory.users.filter((record) => record.role === 'admin' && record.active).map((record) => <option key={record.id} value={record.id}>{record.displayName} ({record.username})</option>)}</select></label>
        <label>Estabelecimento<select name="tenantId" required disabled={busy}><option value="">Selecione uma unidade</option>{directory.establishments.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
        <button className="btn" disabled={busy}>Autorizar unidade</button>
      </form></>}
      <h3>Recuperação de acesso</h3>
      <p>Defina uma senha temporária para um usuário autorizado. As sessões anteriores serão encerradas e uma nova senha será exigida no próximo acesso.</p>
      <form onSubmit={(event) => submit(event, 'inventory_admin_password_reset', (data) => ({
        p_user_id: data.get('userId'),
        p_temporary_password: data.get('temporaryPassword')
      }), 'Senha provisória definida. Informe-a ao usuário por um canal privado.')} >
        <label>Usuário<select name="userId" required disabled={busy}>
          <option value="">Selecione um usuário</option>
          {directory.users.filter((record) => record.active && (isDba || record.role === 'employee')).map((record) =>
            <option key={record.id} value={record.id}>{record.displayName} ({record.username})</option>)}
        </select></label>
        <label>Nova senha provisória (12 a 72 caracteres)<input name="temporaryPassword" type="password" minLength={12} maxLength={72} autoComplete="new-password" required disabled={busy}/></label>
        <button className="btn" disabled={busy}>Redefinir senha e encerrar sessões</button>
      </form>
      <h3>Usuários cadastrados</h3><ul>{directory.users.map((record) => <li key={record.id}>{record.displayName} · {record.username} · {record.role === 'superadmin' ? 'DBA' : record.role === 'admin' ? 'Gestor' : 'Funcionário'}{record.active ? '' : ' · Inativo'}</li>)}</ul>
      <UserDirectoryEditor users={directory.users} user={user} invoke={invoke} onChanged={load}/>
    </>}
  </section>;
}
