# Rodada 3: backend-developer

Data: 27/10/2026. Escopo: contenção do CLIN-QA-512 em `supabase/functions/patient-portal` e `deno check` de `public-booking`, `whatsapp-webhook` e `patient-portal`. Sem deploy, sem migration e sem commit.

## O que fiz

### CLIN-QA-512: contenção (CA0, e CA2 e CA7 na parte do portal)
Base: `docs/seguranca/auditoria-rodada-2.md`, seção 2.4, itens 1 e 4, e `docs/produto/backlog/CLIN-QA-512-portal-dependente-vinculo-confirmado.md`.

- **O texto `cpf_responsavel` deixou de dar acesso.** `acessoPortal.ts:142` (`dependentesDoTitular`) não consulta o banco e devolve `[]`. O banco ainda não tem vínculo explícito, e o comentário da função explica o motivo e onde a consulta futura deve entrar. Com isso, `get_dependentes` (`index.ts:162`) devolve `[]` para qualquer titular, inclusive um cadastro criado pelo `public-booking`.
- **`dependente_id` diferente do titular recebe 403** com `{ error, code: "dependent_not_authorized" }`, com mensagem traduzida que orienta a procurar a recepção (`acessoPortal.ts:151`). A decisão fica em `resolverPacienteDaSessao` (`acessoPortal.ts:164`), chamada em `index.ts:115-128`. Ela recusa também ids que não são texto.
- **`update_contact` só altera o titular** (seção 2.4, item 4). `acaoExigeTitular` (`acessoPortal.ts:179`, chamada em `index.ts:141`) devolve 403 se a sessão estiver num dependente. Hoje isso não chega a ocorrer, porque nenhuma sessão de dependente é aceita, mas a regra fica de pé quando o vínculo explícito entrar.
- **A regra para o vínculo explícito ficou pronta.** `filtrarDependentesElegiveis` (`acessoPortal.ts:108`) agora recebe `VinculoDependente` (`acessoPortal.ts:73`: `dependente_id`, `responsavel_paciente_id`, `clinica_id`, `confirmado_em`, `confirmado_por`, `revogado_em`, `expira_em`), e não mais o CPF. Ela só aceita o vínculo quando todas as condições abaixo valem:
  - aponta para este titular e para a clínica do token;
  - tem data e autor de confirmação;
  - não foi revogado nem expirou;
  - o dependente é menor de 18 anos, com data de nascimento válida;
  - o dependente não é o próprio titular.
  
  Ids repetidos aparecem uma só vez. Ninguém chama essa função ainda: ela espera a tabela do `database-engineer`.
- O frontend (`src/pages/PortalPaciente.tsx:937`) já esconde o seletor quando a lista vem vazia. O `dependente_id` não é guardado no navegador (`:726`, só `useRef`). Não alterei o frontend.

### `deno check` das funções públicas
- Erro encontrado: `TS2589 Type instantiation is excessively deep and possibly infinite` em `public-booking/index.ts:221`, na chamada a `buscarCandidatosPorCpf(db, ...)`. A causa é a comparação estrutural do `SupabaseClient` com a interface `DbIdentificacao` de `_shared/identificacaoPaciente.ts`, um módulo novo da rodada 1 que também é usado pelo `whatsapp-webhook`.
- Correção: `buscarCandidatosPorCpf` passou a receber `cliente: unknown` e a converter internamente para `DbIdentificacao` (`_shared/identificacaoPaciente.ts:110-116`, com comentário). O comportamento não mudou, e o teste do Vitest que usa banco falso continua passando.

## Arquivos tocados
- `supabase/functions/patient-portal/acessoPortal.ts`: o bloco de dependentes foi reescrito; foram adicionados `resolverPacienteDaSessao`, `acaoExigeTitular`, `ERRO_DEPENDENTE_NAO_AUTORIZADO` e `VinculoDependente`; `digitos` foi removido.
- `supabase/functions/patient-portal/acessoPortal_test.ts`: os testes de dependentes foram trocados (os testes de token não mudaram).
- `supabase/functions/patient-portal/index.ts`: só o import, o bloco de sessão (`:107-146`) e `get_dependentes` (`:162`).
- `supabase/functions/_shared/identificacaoPaciente.ts`: só a assinatura de `buscarCandidatosPorCpf`.

## Evidências (comandos executados nesta rodada)
| Comando | Resultado |
|---|---|
| `npx -y deno@2 test --no-lock --config=supabase/functions/deno.json supabase/functions/patient-portal/` | `ok \| 44 passed \| 0 failed` |
| `npx -y deno@2 check --no-lock --config=supabase/functions/deno.json supabase/functions/public-booking/index.ts supabase/functions/whatsapp-webhook/index.ts supabase/functions/patient-portal/index.ts supabase/functions/patient-portal/acessoPortal_test.ts` | antes: 1 erro (TS2589 em `public-booking/index.ts:221`); depois: `exit=0`, sem erros |
| `npx vitest run src/lib/__tests__/identificacaoPaciente.test.ts` | `11 passed` |
| `npx -y deno@2 lint --config=supabase/functions/deno.json` em `acessoPortal.ts`, `acessoPortal_test.ts` e `_shared/identificacaoPaciente.ts` | `Checked 3 files`, sem problemas |
| `npx eslint` nos mesmos 3 arquivos | sem problemas, `exit=0` |
| `npx eslint supabase/functions/patient-portal/index.ts` | 15 `no-explicit-any`, todos anteriores a esta rodada (eram 17; removi 2 `(tokenData as any).pacientes?.cpf`) |

Testes que cobrem o aceite (`acessoPortal_test.ts`):
- **CA0/CA7**: `get_dependentes` devolve `[]` e nenhuma tabela é consultada, mesmo com um banco falso que devolveria um menor cujo `cpf_responsavel` é o CPF do titular.
- **CA0/CA2**: `dependente_id` desse menor, um id forjado, um número ou uma lista são recusados.
- **CA0**: `update_contact` com a sessão num dependente exige o titular; leituras não exigem; o código do erro é `dependent_not_authorized`.
- **CA1**: um vínculo confirmado de menor da mesma clínica é elegível. A função está pronta, mas ainda não é chamada.
- **CA2**: um vínculo sem data ou sem autor de confirmação, revogado ou expirado não é elegível. Um vínculo que expira amanhã ainda vale.
- **CA3**: um vínculo de outra clínica, de outro responsável ou de um titular sem clínica não é elegível.
- **CA8**: quem faz 18 anos hoje, um adulto e um dependente sem data de nascimento ficam de fora; quem faz 18 anos amanhã continua.
- Também testado: sem `dependente_id`, ou com o id do próprio titular, a sessão continua sendo do titular.

`tsc` e `vitest` completos não foram rodados, conforme a regra da rodada. O código do portal é Deno e não entra no `tsconfig.app.json`.

## Pendências
1. **Vínculo explícito (CA1 a CA6), [requer avaliação especializada].** O `database-engineer` cria o modelo no formato de `VinculoDependente`, com confirmação na recepção e grant e RLS testados com duas clínicas. Depois disso, o `backend-developer` troca o corpo de `dependentesDoTitular` por uma consulta a esse modelo, passando por `filtrarDependentesElegiveis`. Antes, é preciso o parecer do DPO sobre a regra dos 18 anos, a curatela e a guarda. Nenhum vínculo por `cpf_responsavel` pode ser migrado como confirmado sem decisão registrada (CA6).
2. **Pré-cadastro do link público (seção 2.4, item 3, e CA7 completo).** `solicitar_acesso` ainda envia link a um titular criado pelo `public-booking`. Com dependentes desligados, esse titular só vê os próprios dados, os que ele mesmo informou, então a cadeia do 512 está cortada. Bloquear o link até a recepção conferir o documento exige uma coluna de origem ou de confirmação em `pacientes`, que é uma migration (`database-engineer`) e uma decisão de produto.
3. **Registro de acesso como dependente (seção 2.4, item 5, CA5).** Não há o que registrar enquanto o acesso estiver desligado. O registro entra junto com o item 1.
4. **Responsável:** confirmar se a versão com dependentes está publicada na VPS (TL-R2-01) e rodar a consulta 2.5 da auditoria. Se estiver publicada, esta contenção precisa ser publicada, e só o responsável pode autorizar isso.
5. A coluna `cpf_responsavel` continua no cadastro e na tela da recepção. Ela não dá mais acesso ao portal, mas a decisão de manter, renomear ou retirar o campo é do `product-owner`.

## Estado do CLIN-QA-512
O item passou de `correção escrita` para **`testado localmente` (E2), apenas na contenção CA0**. CA1 a CA8 completos continuam abertos, e o item segue P0 até a contenção ser publicada e verificada em homologação.

## Próximo dono
- `security-engineer`: revisar a contenção em `acessoPortal.ts:142-181` e `index.ts:107-146`.
- `tech-lead` e `qa-engineer`: incluir na verificação completa da rodada.
- `database-engineer` e `product-owner`: pendências 1, 2 e 5.
- Responsável: pendência 4.
