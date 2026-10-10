# EloLab — diagnóstico e plano de estabilização

> **Para agentes executores:** usar `subagent-driven-development` para implementar por tarefa, com revisão independente. Este documento é um plano preliminar solicitado pelo responsável; não autoriza deploy, migrations ou alterações de produção.

**Status:** a execução das tarefas de produto não integra este pedido de análise/plano. Iniciar correções somente quando o responsável solicitar implementação e resolver as decisões aplicáveis de escopo/contrato.

**Objetivo:** preservar as funcionalidades atuais e organizar a correção dos riscos comprovados de isolamento, acesso e cobrança, com regressão verificável.

**Arquitetura:** manter a SPA React/Vite e os contratos Supabase existentes. Corrigir os fluxos em seus pontos de autoridade: autorização nas Edge Functions, consistência de estados no backend/banco e regularização na interface. Separar cobrança SaaS, cobrança de pacientes e OAuth/Point por clínica.

**Stack:** React 18, TypeScript, Vite, React Query, React Router, Tailwind/shadcn, Framer Motion, Supabase/Postgres/RLS, Edge Functions Deno, Vitest/MSW e Playwright. A hospedagem documentada é Docker/Nginx em Easypanel/VPS; não propor migração de provedor.

**Spec/base de requisitos:** [AGENTS.md](../../../AGENTS.md), [handoff Mercado Pago](../../MERCADOPAGO_CHECKOUT_HANDOFF.md), [fluxos de pagamento](../../PAYMENT_AND_TRIAL_FLOWS.md) e pedido de análise/plano com agentes especializados. As decisões abertas abaixo precisam ser resolvidas antes das tarefas que dependem delas; não há uma nova especificação de produto aprovada.

## Escopo e limites

- Data da análise: 09/10/2026. Base: branch `codex/sync-elolab-deploy-20261008`, HEAD `619b325`, incluindo alterações locais previamente existentes.
- O pedido não especifica uma funcionalidade nova. O plano abrange o diagnóstico geral e prioriza checkout de planos por ser o trabalho em andamento no AGENTS.md. Isso é uma proposta de prioridade, não uma escolha de escopo feita pelo usuário.
- Nesta etapa houve análise estática, verificações locais e criação deste documento. Nenhuma correção de produto foi implementada.
- Preservar as alterações locais de `src/components/whatsapp/AgentsTab.tsx`, `src/components/whatsapp/types.ts`, `src/integrations/supabase/types.ts`, `supabase/functions/whatsapp-evolution/index.ts`, `docker/evolution/compose.yaml` e `supabase/migrations/20261010202000_agente_whatsapp_capacidades_e_confirmacao.sql`.
- Não alterar `pagamentos_mercadopago` ou `lancamentos` nas tarefas de cobrança de planos.
- Não ler, copiar, imprimir ou versionar credenciais. Nenhum `.env` foi aberto como conteúdo na análise; o build usa a configuração local normalmente.
- Não executar deploy, aplicar migration, alterar secrets de produção, DNS ou contas globais. Nenhum push foi feito.
- Integração SQL em banco descartável também exige pedido explícito para aplicar migrations, conforme AGENTS.md. Até isso ocorrer, preparar e revisar SQL sem aplicá-lo.
- Antes de implementação, usar branch/worktree isolada e respeitar o gerenciamento existente do Orca. Não mover ou reverter o trabalho local em andamento.
- O TypeScript atual tem `strict: false`; não ligar strict globalmente como efeito colateral. Introduzir tipos claros nos contratos modificados.
- Confirmar decisões Mercado Pago em documentação oficial. Testes externos de pagamento usam apenas contas de teste e `npm run test:mp-sandbox`.

## Organização dos especialistas

| Responsabilidade | Análise realizada | Execução futura e limites |
|---|---|---|
| Arquitetura | Rotas, providers, tenant/plataforma, contratante e paywall | Fechar contratos de acesso/estados; revisar migrations propostas |
| Frontend | Planos, checkout, guards, cache e acessibilidade estática | Dono de App/SubscriptionGuard/Planos/PlanoCheckout/hooks de cobrança |
| Backend | Ações checkout, webhook, sincronizadores, RPC e sandbox | Dono das funções e regras SaaS; não alterar financeiro de pacientes |
| QA | Segurança da execução local, typecheck, lint, testes e checks | Dono dos testes de integração/E2E; não aprovar implementação própria |
| Revisão visual | Infraestrutura de captura e cobertura UX | Revisar screenshots e jornadas de teclado em preview isolado |
| Segurança | Cron/tenant, webhook, papéis e superfície pública | Revisar autorização e testar cenários adversos com fixtures sintéticas |
| Coordenação | Consolidação, prioridade, build e preservação de arquivos | Integrar entregas sequencialmente e registrar evidências/limitações |

Toda tarefa delegada deve conter objetivo, dono de arquivos, dependências, entregável, critérios de aceite e comandos/resultados. Nenhum arquivo terá dois implementadores simultâneos. O webhook será modificado em sequência nas tarefas de integridade e de sincronização.

## Mapa do código atual

- `src/App.tsx`: providers, cache, rotas lazy, guards e redirecionamentos antigos.
- `src/contexts/SupabaseAuthContext.tsx` e `src/hooks/useSupabaseData.ts`: sessão, clínica corrente e dados com cache por escopo.
- `src/components/SupabaseProtectedRoute.tsx`: papéis clínicos e contas da plataforma.
- `src/components/SubscriptionGuard.tsx`: apresentação do bloqueio; a autoridade de escrita permanece no banco.
- `src/pages/Planos.tsx`, `src/pages/PlanoCheckout.tsx`, `src/hooks/usePlanCheckout.ts` e `src/hooks/useSubscriptionPlan.ts`: contratação, histórico e pagamento.
- `supabase/functions/mercadopago-checkout/planCheckoutActions.ts`: status de cobrança, cartão recorrente e pedidos Pix/boleto.
- `supabase/functions/mercadopago-webhook/index.ts` e `_shared/platformPlanSync.ts`: recebimento de eventos e sincronização da assinatura SaaS.
- `_shared/platformPlanOrders.ts`, `_shared/planCheckout.ts` e migration `20261010197000_checkout_transparente_planos.sql`: normalização, estado de pedido, aplicação atômica de período e expiração pré-paga.
- `_shared/cronAuth.ts`, `stock-alert` e `birthday-greetings`: automações globais do cron e execução manual por clínica.
- `tests/`, `scripts/qa-agent.mjs` e `.github/workflows/`: QA e CI; validar o destino antes de qualquer teste remoto.

## Evidências e prioridades

Os achados abaixo são da versão local. Não foi verificada a configuração publicada nem reproduzida exploração em produção.

| Prioridade | Achado | Evidência e impacto |
|---|---|---|
| Alta | Usuário autenticado sem clínica pode acionar automações globais | `_shared/cronAuth.ts:85`, `stock-alert/index.ts:42,57`, `birthday-greetings/index.ts:57,73`: clínica nula também representa cron; chamadas manuais omitem filtro usando service_role. Ramo confirmado; exploração depende de automação/provedor configurados. |
| Alta | Revogação OAuth usa alvo do corpo sem vínculo suficiente ao ID assinado | `mercadopago-webhook/index.ts:52,76,142` e `_shared/mercadoPagoSignature.ts:29`: assinatura autentica ID, mas desconexão usa `user_id` do corpo. Testar divergência e replay com segredo sintético; cenário requer notificação assinada legítima capturada. |
| Alta | Regularização fica atrás do próprio bloqueio | `App.tsx:229,307,308` e `SubscriptionGuard.tsx:44,82`: navegar para planos pode retornar à mesma tela de bloqueio. `usePlanCheckout.ts:110,134` não invalida `acesso-bloqueado`, cujo cache dura cinco minutos. |
| Alta | Contratante pode não ser o dono cuja assinatura governa a clínica | Checkout usa `user.id`; paywall resolve `clinicas.owner_id` na migration `20260801170000_vencimento_alcanca_a_clinica_inteira.sql:49`. Admin não proprietário pode pagar sem regularizar a clínica. |
| Alta | Cancelamento/pausa externos e falhas não são sincronizados com segurança | Webhook chama `syncPlatformPlan` dentro de `status === authorized` (`:736`). Retornos após falha (`:671,897`) permitem marcador `processado=true` e HTTP 200 (`:307`). Cancelamento iniciado no app segue caminho distinto. |
| Alta | Atualização atrasada de Order pode regredir estado pago | `planCheckoutActions.ts:466` atualiza status sem condição; RPC impede nova concessão pelo status atual (`migration checkout:95`). Corrida é estruturalmente possível, ainda não reproduzida. Evento antes de persistir `mp_order_id` também precisa reconciliação. |
| Alta | Regra documentada de três dias de inadimplência não foi concluída | `platformPlanSync.ts:39` preserva ativa/trial ao receber pending; paywall ainda usa sete dias e estados encerrados. Handoff registra a pendência. Definir marco temporal e preservação do período pago antes de alterar SQL. |
| Média | Plano expirado/cancelado perde CTA de recontratação | `useSubscriptionPlan.ts:60` retorna histórico; `Planos.tsx:225` identifica atual apenas por slug. Loading/erro de billing e método Pix indisponível também produzem ações inconsistentes. |
| Média | Cobertura de integração e visual é insuficiente para homologar checkout | Teste Orders replica RPC em memória; sandbox não executa SQL real, dispatch Edge, cron ou entrega real. `qa-ux.spec.ts:9` não inclui checkout e pode capturar redirecionamento como página planos. |

Outros achados em fila separada: validação de papel ativo em WhatsApp após inativação (`whatsapp-evolution/index.ts:72,125,374,450`, versão local em andamento); rate limit que libera em falha da RPC (`_shared/rateLimit.ts:43`); provisionamento clínica/perfil em duas gravações (`SupabaseAuthContext.tsx:138`); corte em 20 mil registros (`useSupabaseData.ts:101`); hipótese de estado/cache entre abas durante impersonação. Não refatorar esses módulos incidentalmente ao concluir cobrança.

## Baseline de verificação nesta análise

| Verificação | Resultado observado |
|---|---|
| `npm run build` | Exit 0; bundle e PWA gerados localmente; `dist/version.json` gerado; nenhuma publicação |
| `npx tsc --noEmit -p tsconfig.app.json` | Exit 0 |
| `npm run lint` | Exit 0, zero erros e 1.754 avisos em 843 arquivos; 1.669 no-explicit-any, 72 exhaustive-deps, 11 only-export-components e 2 no-useless-escape |
| `npm run check:colunas` | Exit 0; 141 tabelas, 326 arquivos |
| `npm run check:falhas` | Exit 0; zero casos encontrados pelo checker |
| `npm run check:permissoes` | Exit 0; 18 grupos, 70 itens e 67 rotas; mensagens informativas não equivalem a falha |
| `npm run check:a11y` | Exit 0, teto zero; é verificação estática, não aprovação completa de acessibilidade |
| `npm run test:run` | Exit 0; 78 arquivos e 693 testes passaram, zero falhas/skips; Vitest 134,25 s; execução com bloqueio de sockets reais |
| Deno, SQL/RLS, Playwright, sandbox, navegador e webhook real | Não executados nesta fase |

O setup MSW usa `onUnhandledRequest: bypass`. Para esta execução Vitest, QA adicionou um preload temporário fora do repositório que bloqueia conexões reais, sem imprimir destinos ou credenciais. Deno `*_test.ts` não faz parte do corpus `src/**/*.{test,spec}.{ts,tsx}` executado pelo Vitest. Resultado verde de unidade não comprova SQL, gateway, produção ou revisão visual.

## Decisões a fechar antes da execução dependente

1. **Recorte:** concluir checkout primeiro, ou executar também as correções gerais de segurança. Recomendação: corrigir isolamento crítico e liberar regularização; depois concluir consistência da cobrança.
2. **Responsável financeiro:** apenas owner contrata/cancela, ou admin pode agir pelo owner? Recomendação inicial: identificar o responsável pelo tenant no servidor e rejeitar contratação que não regularize esse tenant. Definir a permissão antes de codificar.
3. **Inadimplência:** confirmar marco dos três dias (vencimento da fatura/período), horário/timezone, recuperação e diferenças entre recorrente e pré-pago. Não confundir autorização do cartão com primeira cobrança liquidada.
4. **Direitos adquiridos:** manter acesso já pago durante conversão pré-pago → recorrente e cancelamento antes de `start_date`; confirmar cancelamento no trial e elegibilidade para novos trials.
5. **Homologação:** definir Supabase/banco descartável, clínica sintética e contas Mercado Pago de teste. UI local não basta se seu backend apontar para produção.

## Plano por tarefas e checkpoints

### Tarefa 0 — Contratos e isolamento do trabalho

**Dono:** arquitetura, com coordenação e segurança. **Dependências:** decisões de produto acima para cobrança; segurança cron pode ser detalhada independentemente.

**Arquivos:** ler AGENTS/handoff, migrations de acesso e checkout, contratos de hooks e handlers. Atualizar este plano com decisões; criar especificação de cobrança somente se houver mudança de contrato aprovada.

- [ ] Registrar invariantes: leitura/exportação preservadas quando inadimplente; preço/tenant/permissão determinados no servidor; nenhum período duplicado; nenhuma cobrança recorrente concomitante a Pix/boleto indevido.
- [ ] Fechar responsável financeiro, estados e marco temporal da carência com exemplos de datas de vencimento, pagamento e cancelamento.
- [ ] Preparar isolamento de implementação sem carregar/reverter alterações locais alheias. Registrar baseline e destino de QA.
- [ ] **Checkpoint:** contratos definidos e nenhum arquivo com ownership conflitante. O documento resultante orienta os testes e migrations; não se aplica SQL nesta etapa.

### Tarefa 1 — Restringir automações manuais ao tenant

**Dono:** backend para `_shared/cronAuth.ts`, `stock-alert/index.ts` e `birthday-greetings/index.ts`; segurança revisa. **Dependência:** isolamento de trabalho, não depende de regras de cobrança.

**Interfaces:** preservar `cronSecretOk(req)`, `cronOrUserOk(req)` e `clinicaDoChamador(req, supabase)`. Distinguir explicitamente origem cron e usuário na decisão de autorização; não usar `null` como autorização global para chamada manual.

**Teste proposto:** `supabase/functions/_shared/cronAuth_test.ts`, com JWT/segredo sintéticos, client de banco fake e nenhum envio externo.

- [ ] Escrever testes que falham: usuário sem clínica, perfil ausente ou falha de consulta recebe 403 e não dispara consulta global/envio; usuário A não consulta B; cron com segredo válido mantém processamento global; anon e cron inválido são recusados.
- [ ] Demonstrar as falhas antes da correção e aplicar o menor ajuste nos handlers/helper. Verificar permissão de execução manual conforme o contrato atual de papéis.
- [ ] Rodar Deno check/test desses caminhos em ambiente local, com variáveis sintéticas, e confirmar que funções cron legítimas mantêm comportamento.
- [ ] **Checkpoint:** segurança aprova autorização e QA comprova isolamento com mocks. Integração RLS real fica para Tarefa 7.

### Tarefa 2 — Integridade dos eventos de revogação OAuth

**Dono:** backend para `_shared/mercadoPagoSignature.ts`, roteamento e ramo mp-connect de `mercadopago-webhook/index.ts`; segurança revisa. **Dependência:** concluir revisão da semântica oficial mp-connect antes de definir vínculo.

**Interfaces:** preservar formato HMAC do Mercado Pago; processar alvo verificável do evento autenticado. Janela de replay deve respeitar retries oficiais; não escolher um timeout arbitrário.

**Testes:** expandir `src/lib/__tests__/mercadoPagoSignature.test.ts` e `mercadoPagoWebhookRouting.test.ts`; propor `src/lib/__tests__/mercadoPagoConnectAuthorization.test.ts` para decisão de alvo sem banco real.

- [ ] Fixar fixtures legítimas do contrato oficial; escrever casos query/corpo divergentes, tipo/ação alterados, seller não vinculado e evento repetido. Assertiva central: nenhum segredo OAuth alheio é removido.
- [ ] Confirmar red dos casos adversos; implementar validação/vínculo sem interferir nos tópicos Orders, pagamento e assinatura.
- [ ] Executar testes focados e typecheck Deno do webhook; revisar logs para evitar payload pessoal completo desnecessário.
- [ ] **Checkpoint:** segurança aprova integridade e compatibilidade dos tópicos; Tarefa 4 recebe o webhook somente após essa integração.

### Tarefa 3 — Tornar regularização acessível e coerente

**Dono:** frontend para `src/App.tsx`, `SubscriptionGuard.tsx`, `Planos.tsx`, `usePlanCheckout.ts` e `useSubscriptionPlan.ts`. QA revisa cenários. **Dependência:** Tarefa 0 para permissões; layout mantém identidade atual.

**Interfaces:** preservar `/planos`, `/planos/checkout/:slug` e guard de escrita no banco. Após confirmação, atualizar `user_plan`, `billing_status` e `['acesso-bloqueado', user.id]`; não tratar pending como pagamento confirmado.

**Testes novos propostos:** `src/components/__tests__/SubscriptionGuard.test.tsx`, `src/pages/__tests__/Planos.test.tsx`, `src/hooks/__tests__/usePlanCheckout.test.tsx`.

- [ ] Escrever cenários: clínica bloqueada chega a planos/checkout pelo CTA; anon continua sem acesso; papéis sem permissão não contratam; plano expirado/cancelado oferece recontratação; plano ativo/pré-pago mantém ações apropriadas.
- [ ] Verificar falhas atuais, corrigir exceções de rota sem abrir módulos de escrita e definir CTAs por status/modalidade, com loading/erro de billing explícitos.
- [ ] Testar aprovação e cancelamento atualizando cache/acesso; impedir deep-link Pix de manter formulário indisponível quando há recorrência ativa.
- [ ] Executar Vitest focado e typecheck. **Checkpoint:** jornada completa de regularização sem precisar descobrir o modo leitura; confirmação do backend continua autoritativa.

### Tarefa 4 — Sincronização de assinaturas e consistência de Orders

**Dono:** backend para `mercadopago-webhook/index.ts`, `_shared/platformPlanSync.ts`, `_shared/platformPlanOrders.ts` e `mercadopago-checkout/planCheckoutActions.ts`. Arquitetura revisa contrato e QA cobre concorrência. **Dependências:** Tarefas 0 e 2; dono financeiro coerente com tenant é pré-requisito de aceite.

**Interfaces:** preservar `billing_status`, `create_card_subscription`, `create_plan_order`, `get_plan_order` e `cancel_plan_order`; preservar `syncPlatformPlan` e `aplicar_status_pedido_plano`. Falha transitória deve ser reprocessável, não marcada processada; confirmação repetida concede um único período.

**Testes:** expandir `platformPlanOrders.test.ts`; criar `platformPlanSync.test.ts`, `planCheckoutActions.test.ts` e `mercadoPagoSubscriptionWebhook.test.ts` em `src/lib/__tests__/`, com gateway/client fake. Complementar depois com SQL real isolado.

- [ ] Escrever cenários falhando para cancelamento/pausa externos, falha GET/banco/RPC e admin não owner conforme contrato escolhido; negar manipulação de preço ou tenant.
- [ ] Testar corrida: resposta pending atrasada depois de pago não regrede concessão; evento antes da persistência do ID é reconciliado; duplicatas e retries não criam outra cobrança nem estendem outro período.
- [ ] Corrigir propagação de falhas, sincronização de todos os estados relevantes e atualizações condicionais/atômicas. Se SQL precisar mudar, preparar nova migration revisada; não editar migration histórica aplicada nem aplicar a nova.
- [ ] Executar testes focados e Deno check. Integração da migration em banco descartável segue a autorização específica da Tarefa 7.
- [ ] **Checkpoint:** estados de acesso refletem gateway, sem confirmação perdida e com período concedido exatamente uma vez. Cancelamento no app e externo seguem o contrato aprovado.

### Tarefa 5 — Carência e preservação do período pago

**Dono:** backend/database; arquitetura revisa regras e segurança revisa RPC/RLS. **Dependências:** Tarefas 0 e 4.

**Arquivos:** `platformPlanSync.ts`, regras de invoices/assinaturas no webhook e nova migration proposta `supabase/migrations/20261011000000_regras_inadimplencia_planos.sql` (ajustar timestamp à ordem de migrations no início da execução). Nunca aplicar sem autorização específica.

- [ ] Usar relógio fixo para casos antes/exatamente/depois dos três dias definidos; pagamento recupera acesso; leitura/exportação continuam; limite usa assinatura do responsável do tenant.
- [ ] Testar conversão de período pré-pago vigente para cartão, cancelamento antes da primeira cobrança, trial e eventos atrasados. Não perder direito já pago nem aplicar carência duas vezes.
- [ ] Demonstrar red, implementar regra mínima e revisar SQL, permissões e cron; execução em banco descartável segue a autorização específica da Tarefa 7. Preparar rollback que preserve dados financeiros.
- [ ] **Checkpoint:** matriz de datas/estados aprovada e executada; migration pronta para revisão, ainda não aplicada ao ambiente publicado.

### Tarefa 6 — Acessibilidade e revisão visual independente

**Dono:** frontend para `PlanoCheckout.tsx`/`Planos.tsx`; QA para `tests/qa-ux.spec.ts`, nova `tests/planos-checkout.spec.ts` e ajustes estritamente necessários em `scripts/qa-agent.mjs`. Visual-QA aprova capturas. **Dependências:** integrar Tarefas 3–5 antes da validação final dos estados.

- [ ] Testar seleção do método por teclado, mensagens de loading acessíveis, retry do Brick e layout de CTAs pré-pagos sem overflow. Corrigir pontualmente, sem redesign.
- [ ] Separar UX local de smoke de headers da infraestrutura. Servir build local com destino explícito, sessão/dados sintéticos e interceptações Supabase/MP/ViaCEP; bloquear endpoints remotos do projeto.
- [ ] Confirmar URL final e identificador da tela antes de capturar; evitar screenshot de login rotulada como planos.
- [ ] Capturar 375×812, 768×1024 e 1440×900; adicionar 320px para CTAs estreitos. Incluir trial, ativo, expirado, cancelado, pré-pago, cartão/Pix/boleto, loading/erro, pedido retomado e resultado terminal.
- [ ] Revisar foco/teclado, contraste, zoom, alvos de toque, console e nomes/endereço longos. Heurísticas e PNG anexado não equivalem a aprovação visual.
- [ ] **Checkpoint:** revisor visual independente registra evidências e falhas resolvidas. O Brick real continua exigindo etapa sandbox separada.

### Tarefa 7 — Homologação e regressão de funcionalidades existentes

**Dono:** QA; segurança e visual-QA revisam; implementadores corrigem apenas seus arquivos. **Dependências:** correções selecionadas integradas e ambiente de teste dedicado identificado.

Aplicar SQL/migrations no banco descartável somente após autorização específica para esse destino; até então, limitar-se à preparação e revisão dos scripts.

- [ ] Reexecutar typecheck, lint, quatro checks estáticos, Vitest e build; executar também Deno check/test pertinente. Comparar avisos com baseline sem exigir limpeza global não relacionada.
- [ ] Validar SQL/RPC real em banco descartável: concessão única concorrente, expiração/cron, carência, RLS e negativa de execução por anon/authenticated nas RPCs privilegiadas.
- [ ] Rodar Playwright local mockado para regressão de rotas antigas, login, planos e acesso protegido; cinco perfis clínicos e contas da plataforma devem manter sua matriz de permissão.
- [ ] Em homologação isolada, testar duas clínicas sintéticas, conta sem clínica, admin não proprietário e JWT de funcionário inativado. Fixar URLs; nenhum fallback para host de produção.
- [ ] Rodar `npm run test:mp-sandbox` somente com conta vendedora/compradora de teste; nunca imprimir valores. Depois validar Brick em navegador e webhook real no endpoint isolado, conferindo status no banco e repetição.
- [ ] Registrar que fixture/conta ausente significa cenário não executado. Não apresentar skipped ou teste com banco em memória como integração real aprovada.
- [ ] **Checkpoint:** QA independente compara evidências aos critérios de aceite. Falhas e cenários não executados permanecem explícitos; não declarar cobrança pronta apenas pelo sandbox 17/17 histórico.

### Tarefa 8 — Preparação de entrega, sem publicação

**Dono:** coordenação/devops e revisor final. **Dependência:** Tarefa 7 e escopo acordado concluídos.

- [ ] Revisar diff, conflitos, higiene de segredos, configurações e migrations; manter módulos fora do escopo e alterações WhatsApp alheias intactos.
- [ ] Preparar artefato/preview isolado, destino exato, versão, backup/restauração, health checks e rollback. Atualizar handoff e corrigir documentação que mistura checkout hospedado antigo e transparente.
- [ ] Confirmar proteção de branch e comportamento do webhook Easypanel; o workflow de validação não controla sozinho a publicação da VPS. Não fazer push que dispare publicação sem autorização.
- [ ] **Checkpoint de produção:** somente executar deploy, migrations e mudança de credenciais após autorização explícita para o destino e ações concretas. O presente pedido não fornece essa autorização.

## Review Focus — casos que devem atravessar a revisão final

1. Usuário sem clínica ou com papéis revogados nunca obtém privilégio global/administrativo por manter JWT válido — Tarefas 1 e 7; WhatsApp exige tarefa própria coordenada com seu trabalho em andamento.
2. Corpo de webhook divergente do identificador assinado nunca revoga integração de outro tenant — Tarefa 2.
3. Admin não owner e clínica bloqueada conseguem somente as ações financeiras acordadas, e pagamento regulariza o tenant correto — Tarefas 3 e 4.
4. Evento duplicado/fora de ordem, resposta perdida e falha transitória não duplicam período nem encerram processamento incorretamente — Tarefa 4.
5. Conversão/cancelamento de recorrência, trial e datas-limite preservam período adquirido e permitem regularização — Tarefa 5.

## Fontes externas consultadas

- [Superpowers — obra/superpowers](https://github.com/obra/superpowers): metodologia solicitada; usadas skills locais de contexto, brainstorming, delegação, planejamento e verificação.
- [Mercado Pago — notificações Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications.md): confirmação/reenvio de notificações.
- [Mercado Pago — assinatura autorizada sem plano associado](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments.md): recorrência por preapproval.

## Critério de conclusão deste pedido

- [x] Repositório, instruções, stack, estado Git e handoff reconhecidos.
- [x] Arquitetura, frontend, backend, QA, revisão visual e segurança delegados com limites definidos.
- [x] Achados e fases documentados, distinguindo análise estática de reprodução/integração real.
- [x] Resultado final do Vitest registrado; hashes SHA-256 dos seis arquivos preexistentes conferidos sem diferenças ou arquivos ausentes.
- [x] Nenhuma implementação de produto, migration ou publicação realizada nesta etapa.
- [x] Revisão independente do plano concluída; esclarecidos limites de início da implementação e autorização para migrations também em banco descartável.

Implementação, screenshots, integração SQL/RLS, sandbox e autorização de produção são etapas futuras; não compõem uma alegação de conclusão técnica do checkout nesta análise.
