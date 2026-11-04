# Proposta: acessos por módulo e autoria das notas

Status: registro da ressalva de Lucas após teste humano da PR #159.
Esta PR é somente documental: não implementa permissões, migrações ou filtros.

## Comportamento solicitado
- Funcionário padrão: estoque (contagem e lista de compras), inserção de nota fiscal e faturamento.
- Histórico fiscal do funcionário: somente notas lançadas por ele, no estabelecimento autorizado.
- Gestor configura acessos por módulo e por operação (ver, inserir, alterar), dentro da sua autoridade.
- Hierarquia aprovada por Lucas: Gestor → Gerente → Funcionário, escolhida na criação do usuário.
- Cada perfil começa com liberações padronizadas por módulo/operação; a matriz detalhada ainda precisa de aprovação.
- Gestor define acessos de todos na unidade; Gerente define somente acessos dos Funcionários subordinados.
- Registrar concessão/revogação com autor, usuário afetado, data/hora do servidor, operação e estado antes/depois.
- Não permitir que Gerente altere Gestor/outro Gerente ou conceda poderes acima da própria autoridade.
- Custos, administração, alterações financeiras e dados de outras pessoas não são liberados por acesso genérico ao módulo.

## Condições para implementar depois
1. Mapear as permissões/RPCs existentes e propor matriz de módulos/operações para aprovação.
2. Verificar autoria fiscal confiável do servidor; autoria legada sem prova não autoriza acesso de funcionário.
3. Impor restrições no servidor/banco, inclusive consultas diretas e exportações; esconder tela não basta.
4. Gestor não pode conceder a si ou a outro usuário autoridade que não possui nem atravessar estabelecimentos.
5. Testar dois funcionários, Gestor e duas unidades; cobrir leitura, escrita, exportação e permissão negada.
6. Planejar compatibilidade, auditoria e reversão, sem apagar usuários, documentos ou histórico.

## Limites da aprovação
O teste de login da #159 foi aceito por Lucas. Esta ressalva é evolução separada,
não alteração da restrição de ref Supabase. Implementação de login/permissões/banco
exige definição da matriz, revisão independente e autorização específica antes de aplicar SQL.
Nenhum dado real do anexo fiscal faz parte deste registro.
