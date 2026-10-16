# Documentos do Portal do Paciente: plano de implementação

> **Execução:** inline nesta sessão, conforme instrução persistente do usuário para concluir etapas sem depender de aprovações. Cada tarefa termina com validação própria.

**Goal:** permitir que profissional/admin publique anexos escolhidos do prontuário no portal, com origem e validade visíveis e links privados assinados por cinco minutos.

**Architecture:** migration cria metadados de publicação separados dos anexos clínicos imutáveis, RLS de leitura clínica e RPC transacional que valida a clínica, o papel, o anexo e a validade. A Edge Function do portal lista somente publicações vigentes do próprio paciente, valida o path no bucket privado e gera URL assinada curta sem devolver path. A ficha de anexos controla publicação; o portal mostra nome, categoria, origem, validade e expiração do link.

**Tech Stack:** PostgreSQL/Supabase RLS e RPC; Edge Function Deno; React/TypeScript, Supabase Storage; Vitest e Deno tests; PGlite descartável.

**Spec:** item 30 de `docs/ROADMAP_MELHORIAS_100_E_5_MODULOS.md`.

## Mapa de arquivos

- `supabase/migrations/20261014180000_documentos_portal_paciente_controlados.sql`: tabela de publicação, RLS, índices e RPC.
- `src/lib/__tests__/portalDocumentosPacienteMigration.test.ts`: contrato da migration, grants e segurança da RPC.
- `src/components/clinical/AnexosProntuario.tsx`: consulta do estado e diálogo de publicar/revogar com origem e validade.
- `src/components/clinical/__tests__/AnexosProntuario.test.tsx`: UI acessível, permissões, publicação e revogação.
- `supabase/functions/_shared/portalDocuments.ts` e `portalDocuments_test.ts`: validação de path, paciente/clínica, vigência e expiração curta.
- `supabase/functions/patient-portal/index.ts`: rejeita token de paciente inativo e implementa `get_documentos` com serviço de storage privado.
- `supabase/functions/patient-portal/documentos_test.ts`: casos puros da lista de documentos e contrato do prazo curto.
- `src/pages/PortalPaciente.tsx` e `src/pages/__tests__/portalDocumentos.test.tsx`: carga isolada, aba e apresentação de origem/validade/expiração.
- `docs/ROADMAP_MELHORIAS_100_E_5_MODULOS.md`: registra E47 e 46/100 somente após testes.

## Tarefas

### 1. Controle no banco

- [x] Escrever testes de migration para tabela sem acesso direto de escrita, tenant, roles, anexo pertencente ao paciente e mesma clínica, publicação/revogação, validade vencida e referência ao anexo.
- [x] Rodar o teste para confirmar falha antes da migration.
- [x] Criar `documentos_portal_paciente` com chave única por anexo, clínica/paciente, origem categorizada, validade opcional, publicação, ator e timestamps. Recusar publicação com validade passada em horário de São Paulo.
- [x] Implementar RPC `gerenciar_documento_portal_paciente(p_anexo_id uuid, p_publicado boolean, p_validade_ate date, p_origem text)`; permitir somente admin ou médico, derivar paciente/clínica do anexo sob lock, exigir vínculo ao prontuário e negar ficha de outra clínica.
- [x] Dar SELECT apenas aos perfis autorizados e bloquear insert/update/delete diretos; usuário autenticado altera pelo RPC.
- [x] Aplicar a migration no PGlite com fixtures sintéticas e executar todos os cenários do contrato.
- [x] Rodar Vitest focado e commitar esta tarefa.

### 2. Publicação na ficha de anexos

- [x] Escrever teste falhando para carregar status de publicação, exigir origem e permitir validade em data futura ou sem vencimento.
- [x] Acrescentar permissão explícita ao wrapper da página de prontuários; não oferecer controles para perfis sem admin/médico A ficha somente leitura nao bloqueia a gestao dos metadados isolados de publicacao.
- [x] Adicionar diálogo por anexo com origem categorizada, validade opcional, publicar/revogar via RPC e atualização após sucesso; não alterar nem sobrescrever a linha do anexo assinado.
- [x] Validar testes focados e TypeScript; commitar.

### 3. Serviço seguro do portal

- [x] Escrever testes falhando para rejeitar URL/path fora do bucket ou da pasta daquele paciente/prontuário, documento expirado, publicação revogada e link com validade diferente de 300 segundos.
- [x] Implementar helper puro para conferir escopo e vigência; assinar apenas após validação da publicação, anexo, paciente e clínica.
- [x] Implementar ação `get_documentos` paginada e idempotente, retornando apenas metadados selecionados e URL assinada; não retornar path privado, token ou erro do Storage.
- [x] Recusar sessão de portal se o paciente estiver inativo, inclusive se houver token antigo em corrida com revogação.
- [x] Rodar Vitest do contrato, Deno tests e PGlite/mocks de sucesso, erro de storage, validade, revogação e isolamento entre clínicas; commitar.

### 4. Lista no portal

- [x] Escrever teste falhando para a aba Documentos mostrar nome, origem, validade e aviso de link de cinco minutos, sem renderizar a publicação quando a carga falha.
- [x] Carregar documentos em endpoint separado dentro da carga tolerante já existente; tratar ausência/falha sem expor documentos antigos nem quebrar as demais abas.
- [x] Acrescentar a aba Documentos com estado vazio/erro, download seguro e informação clara de validade do documento versus expiração temporária do link.
- [x] Rodar teste de UI focal, check de acessibilidade, TypeScript e build; commitar.

### 5. Fechamento E47

- [x] Rodar `npx vitest run`, `deno test` dos arquivos do portal, checks de permissões/colunas/falhas/acessibilidade, `git diff --check` e build.
- [x] Revisar fluxo de autorização, RLS, links e ausência de path/URL permanente em payload.
- [x] Atualizar item 30 e contagem para 46/100 com evidências; commitar e confirmar build ID igual ao commit e worktree limpo.

## Foco de revisão

- Um perfil de outra clínica não publica, lê ou revoga documento por conhecer UUID.
- Anexos ligados a prontuários assinados permanecem imutáveis; metadados ficam separados.
- Publicação expirada/revogada não recebe signed URL; erros não revelam URL, chave ou caminho interno.
- Link temporário tem cinco minutos e o portal não recebe dados de paciente inativo.
- Documentos de outra pasta, de outro prontuário ou URLs externas não são assinados pelo cliente de serviço.
