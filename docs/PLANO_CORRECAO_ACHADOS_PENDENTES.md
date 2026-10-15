# Plano de correção dos achados pendentes do EloLab

**Atualizado em:** 13/10/2026  
**Objetivo:** concluir e comprovar os achados já identificados antes de iniciar a próxima fase de expansão do EloLab como plataforma completa para clínicas.  
**Escopo desta fase:** correção de defeitos, integridade de dados, segurança, conclusão de fluxos existentes e validação. Não incluir módulos novos ou expansão de produto até o aceite final deste plano.

## Regras de execução

- Preservar todas as alterações locais existentes. O checkout atual contém trabalho não commitado extenso; nenhum reset, limpeza ou substituição ampla de arquivos.
- Não implantar código, aplicar migrations, alterar secrets, DNS, configuração externa ou dados de produção sem pedido explícito do responsável.
- Proteger contas assinantes e dados clínicos: nenhuma migração destrutiva, exclusão, mudança de owner ou suspensão de acesso sem prova em ambiente descartável e plano de reversão.
- Usar clínica, perfis, pacientes e cobranças sintéticos nos testes autenticados. Não usar conta de assinante para QA.
- Para cobrança SaaS, consultar este plano junto de [AGENTS.md](../AGENTS.md) e [MERCADOPAGO_CHECKOUT_HANDOFF.md](MERCADOPAGO_CHECKOUT_HANDOFF.md). Usar somente contas de teste e `npm run test:mp-sandbox`. Não alterar o financeiro de pacientes (`pagamentos_mercadopago`, `lancamentos`) ao corrigir cobrança dos planos.
- Tratar documentos anteriores como histórico até confirmar cada afirmação contra o código atual. Um achado antigo só volta ao backlog se for reproduzido ou continuar demonstravelmente sem validação.
- Cada etapa termina com diff revisado, testes/evidências registrados, riscos restantes e aceite explícito de QA. Não declarar uma etapa concluída por build verde sozinho.

## Estado conhecido na abertura deste plano

### Já corrigido localmente; preservar e revalidar

- Fluxos visuais de rotas autenticadas: cobertura sintética das 88 rotas protegidas em desktop e tablet, com conteúdo, H1, exceções de JavaScript e overflow horizontal.
- Busca global, aliases canônicos, rótulos de rotas, títulos ausentes, estados vazios de vários módulos e preferências de acessibilidade.
- Dependências de hooks em componentes de agenda, autenticação, prontuário, relatórios, estoque, chat e outros módulos; os achados de hooks reportados anteriormente foram zerados na varredura focal.
- Testes unitários gerais previamente aprovados; validações de colunas, falhas silenciosas, permissões, acessibilidade, build e auditoria de dependências foram executadas em rodadas anteriores.
- O fechamento acidental do tour já foi corrigido nesta sessão: dispensar não grava conclusão; conclusão só é persistida no fim. Há dois testes focados para esse comportamento.

Esses itens não serão refeitos sem regressão. A rodada final repetirá apenas os comandos pertinentes depois das correções que os afetarem.

### Pendências confirmadas ou que exigem nova conferência

- RLS, isolamento entre duas clínicas e autorização real por papel ainda precisam de execução autenticada contra Supabase descartável. Testes sintéticos de rota não comprovam políticas de banco.
- A auditoria de schema documenta referência a `encaminhamento_status_history` ausente no banco verificado. A migration correspondente precisa ser validada em ambiente descartável; não está autorizada a aplicação na VPS.
- A migration local de preferências de acessibilidade está preparada, mas não há comprovação de aplicação no banco. Validar compatibilidade e uso antes de qualquer rollout.
- `PR15_MIGRATIONS_47.sql` é um SQL agregado com operações `DELETE` e atualizações de tabelas sensíveis. Revisar escopo, origem e equivalência com migrations versionadas antes de considerar qualquer aplicação.
- O handoff de cobrança ainda lista validação de ponta a ponta no navegador, confirmação de entrega real do webhook de teste, regra de inadimplência de três dias, aviso antes de vencer período pré-pago e fluxo hosted de `public-checkout` fora do checkout novo.
- OAuth/Point de Mercado Pago ainda requer teste de autorização, desconexão e cobrança em clínica de QA própria.
- O plano de prontidão comercial registra cópia externa criptografada e restauração testada, canal externo de alertas, revisão jurídica dos termos/LGPD/SLA e confirmação de preços/limites comerciais.
- `public.delete_all_app_data()` aparece em três migrations antigas como `SECURITY DEFINER` e apaga tabelas de pacientes, prontuários, pagamentos/assinaturas, funcionários e auditoria. A migration `20260508031146_...` revoga execução de `PUBLIC`, `anon` e `authenticated`, mas o estado aplicado no banco de produção não foi verificado. Há uma nova migration local que remove a função com `DROP` sem `CASCADE`; não aplicada.
- O laboratório tem execução ponta a ponta/RLS pendente em Postgres isolado e validação clínica de PDFs/assinatura; há decisões clínicas que precisam de responsáveis da clínica.
- Visualmente, resta revisar as rotas autenticadas de maior uso com captura e inspeção humana em desktop. A captura de 88 rotas valida estrutura, não substitui avaliação visual detalhada de cada tela. A explicação dos indicadores de Recepção foi corrigida para não depender de hover e verificada em 1280×800 e 1440×900; ainda há telas prioritárias a inspecionar visualmente.

### Achado adicional confirmado na revisão de migrations

- `20261006140000_revoga_conta_de_desenvolvimento.sql` bane uma conta por e-mail, remove seu papel de admin e cancela assinatura ativa/trial. Confirmar objetivo e identidade exata do alvo, se a migration foi aplicada e se há cobrança/direito adquirido associado. Não executar novamente nem generalizar a regra para assinantes.

Rechecagem: a migration está versionada em `origin/main` no commit `bc27888`, mas a disponibilidade do frontend/build não comprova se o SQL foi aplicado. A consulta do ledger Supabase continua sem autenticação. Não reexecutar nem criar uma migration compensatória sem confirmar o usuário, a assinatura e o estado anterior no banco com acesso autorizado.

### Diagnósticos estruturados — autorização alinhada ao prontuário

A policy de leitura dos diagnósticos foi endurecida em migration aditiva local: exige a clínica do prontuário, perfil admin ou médico autorizado e leitura auditada quando o prontuário está assinado. A alteração afeta somente SELECT e não modifica registros. Teste unitário estático cobre essas condições, mas não prova comportamento do Postgres. Antes de rollout, validar em banco descartável com duas clínicas, admin, médico responsável/não responsável, recepção, financeiro, prontuário assinado/não assinado e auditoria recente/ausente. A migration não foi aplicada a produção.

A consulta de `paciente_comorbidades` também foi restringida: mantém acesso de admin, recepção e equipe clínica na própria clínica, retirando perfis financeiros; a UI confirma uso na ficha de paciente/recepção e em fluxos clínicos. Migration aditiva somente de policy. O teste estático verifica os papéis e a ausência de mutações, mas a matriz RLS permanece pendente em Postgres descartável.

## Execução deste plano

### Correções locais concluídas nesta rodada

- Consolidado o cabeçalho visual em Pacientes, Exames e Cobrança de inadimplentes; evidências e itens visuais seguintes estão no [handoff de design](HANDOFF_DESIGN_COMERCIALIZACAO.md).
- Corrigida a retenção local do auto-backup para percorrer e paginar diretórios profundamente aninhados e contar somente exclusões confirmadas. Testes Deno e type check passaram; isso não comprova restore nem valida ambiente de produção.
- Corrigidos nomes acessíveis e estado expandido dos controles da sidebar; testes, TypeScript, lint e verificador de acessibilidade passaram.
- Continuam pendentes as verificações autenticadas de isolamento RLS entre clínicas, restore em ambiente descartável, revisão dos riscos históricos de vínculo entre clínicas e a trilha completa de checkout/webhook em sandbox. Nenhuma migration ou mudança de produção foi aplicada.
- Regressão após estas correções: 216 arquivos/1.145 testes Vitest, build de produção, 3/3 cenários Playwright desktop e verificação de acessibilidade passaram. O canal Realtime dos dados sintéticos caiu para polling durante o Playwright sem falha dos testes.
- `npm run test:mp-sandbox` passou em 15/15 cenários após confirmar `test_user`; temporários cancelados e order aprovada mantida só no sandbox conforme o script. Navegador e entrega real de webhook ainda não foram provados.
- A tela Fila de Atendimento migrou para o cabeçalho compartilhado; testes focais e Playwright desktop passaram após atualizar a asserção para distinguir a ação do cabeçalho da ação do estado vazio.
- O Laboratório agora inicia na Worklist; os indicadores ficam no Pipeline e ainda abrem a Worklist filtrada. O estado de Pipeline sem amostras oferece “Registrar coleta”, não exibe taxa 0/0 e não mantém cinco colunas vazias. Playwright, lint, TypeScript, detector visual e build passaram.
- A Recepção agora oferece estados vazios com ações específicas para busca sem resultados, dia sem agendamentos e etapa sem pacientes; “Criar encaixe” abre o diálogo existente. O indicador de adicional usa texto curto que não corta em 1280 px. A busca da Agenda mantém largura mínima de 240 px em 1280. Playwright sintético Chromium 3/3 cobre 14 rotas em 1440×900 e 1280×800 (incluindo captura adicional da aba Lista de Espera), sem overflow horizontal. A checagem alpha-aware de pares WCAG passou para badges semânticas; `Aguardando` e `Urgente` tiveram contraste corrigido e `Ativo` em Convênios agora usa variante success. QA independente confirmou as cores nas duas larguras com interceptação sintética, sem erro de página ou escrita real. A primeira dobra da Recepção com sete pacientes sintéticos foi inspecionada em 1280×800: compactação dos indicadores e dos espaçamentos faz três pacientes aparecerem completos; a explicação dos indicadores permanece visível em uma linha truncada com o texto integral no `title`. Playwright 1/1, TypeScript e detector Impeccable passaram; ESLint sem erros (51 avisos existentes nos módulos inspecionados). Nenhuma escrita real ocorreu.
- Foi preparada a migration `20261013110000_remove_app_wide_delete_rpc.sql`, que remove apenas a função global destrutiva sem `CASCADE` e falha se a função permanecer. A busca estática não encontrou chamadas do app. Não foi aplicada nem validada em Postgres descartável: `psql` não está disponível e a equipe não iniciou Docker/Supabase local; o estado de produção segue desconhecido.

### 13/10/2026 — baseline e primeiras correções locais

- Baseline anterior: `npx tsc --noEmit` passou; suíte completa Vitest passou (212 arquivos, 1.132 testes); checks de colunas (153 tabelas/382 arquivos), falhas silenciosas, permissões (18 grupos/71 itens/70 rotas) e acessibilidade passaram.
- Corrigido escopo de Edge Functions manuais: perfis explicitamente inativos não recebem escopo de clínica para executar rotinas; perfis sem vínculo/falha de consulta continuam negados. Adicionados três testes Deno.
- Endurecido rate limit nos endpoints de portal, guias, checkout público, convites e agendamento: falha do RPC interrompe a requisição sensível em vez de liberar bypass. Telemetria não sensível conserva comportamento fail-open. Adicionados quatro testes Deno.
- Corrigido alvo de revogação OAuth `mp-connect`: `user_id` só é aceito quando corresponde ao `data.id` assinado. A documentação oficial apresenta os dois IDs como o ID do vendedor nesse evento. Adicionados quatro casos de teste; fonte: [notificações opcionais do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/mp-point/optional-notifications).
- Corrigido processamento de webhook: falhas finais de busca de pagamento/assinatura agora retornam erro para permitir retry; erros de consulta/gravação críticos não são tratados como sucesso; evento só é marcado processado após gravação confirmada; disputa por evento recém-inserido retorna 503 em vez de confirmar sucesso sem prova. Reduzida também a informação impressa no log de entrada.
- Checkout Pix consulta a order recém-criada por GET para obter instruções atualizadas, com fallback seguro para o retorno do POST se a leitura falhar. A mudança também atendia boletos antes de serem retirados.
- Corrigido o acesso de clínicas bloqueadas à gestão de planos: `/planos` pode ser aberta para regularização, e a aprovação do cartão ou pedido invalida o cache do bloqueio para refletir a reativação sem esperar cinco minutos. Adicionados testes para rota, chave e invalidação do cache.
- Retirada a emissão de boleto para novos pagamentos de planos: checkout mostra cartão e Pix, a Edge Function rejeita chamadas com `metodo=boleto`, e o teste de sandbox não cria mais boletos. Ordens de boleto já existentes permanecem consultáveis/canceláveis para não apagar nem encerrar cobranças emitidas anteriormente.
- Revalidação desta retirada: typecheck, build, lint sem erros, 23 testes Vitest de pedidos de plano, teste Deno de rejeição do boleto e Playwright Chromium para as opções do checkout passaram. O Playwright confirmou que `?metodo=boleto` antigo abre o checkout sem selecionar/exibir boleto.
- Validação anterior do lote: `npx tsc --noEmit`; build; Vitest (213 arquivos/1.135 testes); 38 testes Vitest focados; 7 testes Deno; Deno check nas duas Edge Functions alteradas; checks de colunas (153 tabelas/383 arquivos), falhas silenciosas, permissões e acessibilidade passaram.
- Rechecagem atual do checkout: `npx vitest run --reporter=dot` passou em 232 arquivos e 1.230 testes. Mensagens de erro em `stderr` pertencem a cenários de falha simulada; não houve falha de teste.
- `npm run build` passou no checkout local e gerou a PWA; build local `8ed7faebb0bb8405`. Esse identificador é local e não foi publicado nem comparado como se fosse a versão ativa.
- Playwright Chromium local: 88 rotas autenticadas sintéticas em desktop e verificação da tela de preferências passaram (2/2 testes); sem exceção JavaScript, tela vazia ou overflow horizontal. As escritas foram interceptadas e a clínica era sintética; isso não substitui RLS real do banco.
- Mercado Pago sandbox: token foi confirmado como usuário de teste. Na rodada anterior à retirada do boleto, 15/17 cenários passaram; os cenários de boleto não foram conclusivos e a repetição foi interrompida pela API durante a criação. Boleto foi então removido do produto; o sandbox futuro não deve mais criar essa cobrança. Esses resultados não indicam falha dos fluxos mantidos (cartão/Pix).
- `npm run lint -- --quiet` passou sem erros. O lint completo reporta 1.829 avisos em arquivos espalhados pelo checkout; o erro detectado nesta sessão foi corrigido.
- `git diff --check` não apontou erros de whitespace; exibiu somente avisos normais de conversão LF/CRLF do Git.
- Ainda não executados: Postgres/Supabase descartável, RLS/duas clínicas, teste de concorrência real do webhook, testes de integrações externas e qualquer ação de produção. A correção da concorrência completa de eventos requer claim/lease transacional validado em banco isolado; não está declarada concluída por esta mudança.

## Sequência de trabalho e critérios de aceite

### Fase 0 — Fixar baseline e limpar o inventário

**Objetivo:** distinguir bugs ativos de relatórios antigos e estabelecer um retrato confiável sem tocar em produção.

1. Preservar a árvore de trabalho e registrar arquivos modificados antes de cada lote; não sobrescrever trabalho de outras sessões.
2. Conferir `docs/AUDITORIA_MODULOS_QA.md`, `docs/AUDITORIA_UX_MODULOS_TELAS.md`, `docs/ROADMAP_COMERCIAL_SAAS.md`, `docs/ONBOARDING_PROGRESS.md`, `docs/LABORATORIO_PROGRESS.md`, o handoff Mercado Pago, readiness e migrations atuais contra o código presente.
3. Atualizar uma matriz rastreável com ID, achado, evidência atual, severidade, arquivos, dependência, teste, situação e responsável pelo aceite.
4. Executar baseline local somente: typecheck, build, suítes unitárias/focadas, E2E com backend simulado, checks de schema/rotas/permissões/acessibilidade e `git diff --check`.
5. Separar findings em: reproduzido e corrigível localmente; requer backend descartável; requer decisão de produto/financeiro; requer provedor/infra; já corrigido.

**Aceite:** todos os achados citados nos documentos têm situação atual e evidência; nenhum resultado de teste simulado é descrito como validação real de RLS, Mercado Pago, webhook ou produção.

### Fase 1 — Dados, autorização e migrações seguras (prioridade máxima)

**Objetivo:** eliminar risco de acesso cruzado ou perda de dados antes de ampliar qualquer fluxo.

1. Revisar no código atual as chamadas manuais de cron/Edge Functions e garantir que falha de perfil/tenant negue acesso; somente autenticação de cron válida pode executar tarefas globais. Cobrir usuário sem clínica, papel inativo, clínica A tentando acessar B, anon e cron autorizado.
2. Revisar assinatura e alvo de eventos `mp-connect`: o ID autenticado pela assinatura deve corresponder ao recurso revogado. Cobrir divergência query/corpo, replay, evento inválido e evento legítimo sem apagar credenciais de outra clínica.
3. Inventariar migrations locais não aplicadas e migrations referidas em `PR15_MIGRATIONS_47.sql`. Para cada operação destrutiva, identificar tabela, filtro, quantidade afetada, FK/cascade, condição de duplicidade, transação e restauração possível.
4. Comparar o SQL agregado com os arquivos versionados. Resolver divergências no arquivo-fonte correto; o agregado não vira fonte de verdade por estar combinado.
5. Revisar especificamente deleções em conversas, prontuários, filas, exames e dados de teste. Preservar histórico clínico, mensagens e trilha de auditoria. Remoção só pode alcançar linhas sintéticas/órfãs comprovadas e ter precondição que faça a migração abortar se houver dado real inesperado.
6. Validar a migration de `encaminhamento_status_history` e a migration de preferências num Postgres/Supabase descartável, com schema inicial representativo e cópia sintética. Verificar aplicação repetida quando suportada, políticas RLS, grants, rollback/recuperação e ausência de deleção de dados.
7. Executar testes RLS com duas clínicas e contas dedicadas por perfil; testar leitura, inserção, atualização, exclusão, Storage e RPC/Edge Function. Confirmar que a chave privilegiada nunca chega ao cliente.

**Aceite:** QA de segurança confirma isolamento negativo e positivo; migrations passam no banco descartável; nenhum SQL é aplicado à VPS; lista de arquivos/efeitos e estratégia de rollback foi revisada.

### Fase 2 — Contratação, assinatura e preservação de assinantes

**Objetivo:** fechar os achados históricos de cobrança SaaS sem afetar cobranças ou dados financeiros da clínica.

1. Reproduzir e corrigir a rota de regularização quando o paywall está ativo; `/planos`, checkout, cancelamento e retorno devem funcionar sem reabrir módulos de escrita indevidos. Invalidar o cache de acesso só após confirmação autoritativa.
2. Confirmar quem é o contratante autorizado e qual assinatura governa cada clínica (owner, admin delegado, clínicas antigas sem vínculo). Não cobrar um usuário se o pagamento não regularizar o tenant esperado.
3. Corrigir monotonicidade dos pedidos: resposta antiga `pending/failed` não pode substituir pedido pago; webhook duplicado concede período uma única vez; evento recebido antes da gravação do ID deve ser reconciliável; falha transitória permanece reprocessável.
4. Cobrir webhooks de assinatura para autorização, pausa, cancelamento externo, inadimplência, recuperação, falha temporária de RPC/DB e notificações repetidas. Não marcar como processado quando o trabalho necessário falhou.
5. Fechar por escrito regra de inadimplência: marco dos três dias, fuso/horário, vencimento versus falha, recorrente versus pré-pago, recuperação, cancelamento no trial e tratamento do tempo já pago. Só então alterar a regra no código/migration.
6. Garantir direitos adquiridos: conversão pré-pago/recorrente, cancelamento antes do início, renovação atrasada e pagamento recuperado não removem período já pago nem criam períodos duplicados.
7. Corrigir estados de plano expirado/cancelado e recontratação, loading/erro de billing, métodos indisponíveis e mensagens da interface. Checkout não pode indicar pagamento confirmado enquanto o gateway ainda está pendente.
8. Executar typecheck Deno, testes de unidade/RPC em Postgres descartável, testes E2E de UI com respostas simuladas e `npm run test:mp-sandbox` com usuários de teste. A suíte sandbox precisa validar resultados do gateway e não substituir a execução da migration/RPC real.
9. Confirmar entrega do webhook com transação de teste autorizada e o painel Mercado Pago, sem credenciais reais nem deploy de produção nesta etapa.
10. Tratar lembrete de vencimento e checkout hospedado antigo como achados de compatibilidade: verificar se ainda fazem parte do caminho oferecido; corrigir ou documentar substituição antes de desligar qualquer fluxo ativo.

**Aceite:** matriz de estados e datas aprovada pelo responsável do produto; todos os testes de concorrência/duplicidade passam; uma conta de QA de ponta a ponta regulariza a clínica sintética correta; a assinatura de assinantes existentes não é alterada.

### Fase 3 — Jornadas autenticadas clínicas e integrações

**Objetivo:** verificar as ações reais mais importantes do dia a dia, para cada papel, no backend descartável.

1. Executar agenda → recepção/chegada → fila → triagem → prontuário → solicitação/coleta → resultado/laudo → encerramento/conta, com dados sintéticos, troca de perfil e preservação de paciente/agendamento.
2. Verificar salvamento, falha recuperável, duplicidade, rascunho, concorrência e trilha de auditoria nos formulários clínicos; não usar ações destrutivas com dados reais.
3. Validar portal do paciente e guias por token: escopo, expiração, revogação, enumeração, arquivos privados e isolamento por clínica.
4. Validar WhatsApp e demais Edge Functions apenas com stub local/conta própria; conferir papel ativo após inativação, limites, confirmação humana para ações externas e comportamento em retry.
5. Laboratório: executar fluxo ponta a ponta com migration/RLS isoladas; verificar histórico e retificação de resultados, alertas críticos e acesso. A clínica responsável valida nomenclatura, valores de referência, preparo, assinatura e regras assistenciais antes de uso real.
6. Mercado Pago Point/OAuth de clínica: testar conexão, refresh, desconexão/revogação, pedido idempotente e estorno com clínica sandbox própria; confirmar separação dos livros de cobrança SaaS e financeiro de pacientes.

**Aceite:** testes autenticados cobrem perfis permitidos e negados no backend, não só na navegação; registros da execução não contêm dados identificáveis; fluxos dependentes de fornecedor ficam marcados como não validados se suas credenciais/stubs estiverem ausentes.

### Fase 4 — Correções finais de UX e acessibilidade em desktop

**Objetivo:** concluir achados visuais existentes sem iniciar redesign ou módulos novos.

1. Inspecionar visualmente, em Chromium desktop 1440×900 e 1280×800, as jornadas de maior uso por perfil: dashboard, agenda, recepção/fila, pacientes/prontuário, exames/laboratório, financeiro, equipe/configurações e suporte.
2. Verificar cabeçalho/título, hierarquia, densidade e largura de tabelas, filtros, abas, estados de loading/erro/vazio, feedback de salvamento, confirmação de ação, teclado/foco, contraste e consistência com aliases.
3. Corrigir bugs visuais e funcionais comprovados. Consolidar cores/tokens locais apenas quando a captura mostrar inconsistência concreta; evitar migração estética ampla durante correção de defeitos.
4. Rever nomes acessíveis e navegação por teclado, inclusive autenticação, tabelas de alta densidade, diálogo do onboarding e controles de ações clínicas.
5. Estender a preferência de formato de data somente onde o valor é uma data de apresentação; manter ISO para chaves, filtros, payloads e integrações. Resumo por e-mail continua desligado até haver envio agendado real.
6. Corrigir copy comercial de preço, primeira cobrança, teste, cancelamento, limites, migração e suporte somente contra condições comerciais confirmadas; remover afirmações de segurança sem controle verificável.

**Aceite:** capturas desktop antes/depois e lista de achados fechados; sem overflow/controle inacessível nas telas revisadas; não reabrir critérios mobile como eixo desta rodada.

### Fase 5 — Operação, continuidade e prontidão para clientes

**Objetivo:** fechar os achados que dependem da infraestrutura e governança operacional existente.

1. Configurar cópia de backup criptografada fora da VPS, retenção definida e procedimento de acesso restrito; executar restauração em ambiente isolado e medir RPO/RTO.
2. Criar canal de alerta externo à VPS para indisponibilidade, falha de Edge Function, webhook/cobrança e backup/restore. Ensaiar alerta e escalonamento.
3. Validar DNS/HTTPS de domínios contratados, cabeçalhos/CSP, política de deploy Easypanel, health/version endpoint e rollback. Resolver proteção CI da branch e risco de deploy automático antes de qualquer liberação.
4. Medir build de preview e Core Web Vitals/Lighthouse em desktop; revisar peso do precache PWA e desempenho de páginas longas/tabelas. Corrigir regressões relevantes sem trocar stack ou provedor.
5. Revisar termos, privacidade, papéis LGPD, retenção, localização/hospedagem e SLA com responsável jurídico; confirmar razão social/CNPJ/encarregado e frequência real de backup.
6. Confirmar preço, trial, limites, recursos e suporte de cada plano com o responsável comercial.

**Aceite:** restore comprovado em destino separado, alertas externos testados, CI bloqueia release inválida, documentação legal/comercial revisada pelos responsáveis. Itens sem acesso administrativo permanecem explicitamente bloqueados, sem serem declarados corrigidos.

### Fase 6 — Regressão integral e encerramento da fase

1. Rodar suíte Vitest completa, `npx tsc --noEmit`, `npm run build`, checks de colunas/falhas/permissões/acessibilidade e lint; registrar warnings existentes e alterações.
2. Rodar Playwright desktop com rotas públicas, 88 rotas protegidas sintéticas, perfis, aliases e jornadas clínicas no backend descartável.
3. Rodar Deno check/test das Edge Functions alteradas e testes RLS/RPC no Supabase descartável; executar sandbox MP quando a fase 2 alterar checkout/webhook.
4. Revisar diff inteiro, procurar secrets acidentais, comandos/migrations pendentes e arquivos não planejados; confirmar que o financeiro de pacientes ficou fora da alteração de cobrança SaaS.
5. Atualizar relatórios e handoffs com evidência datada, indicando separadamente aprovado, não executado e dependente de acesso/decisão.

**Aceite final:** todo achado conhecido está corrigido e verificado, ou tem bloqueador externo nomeado com responsável e evidência. A próxima fase de expansão só começa depois deste aceite; deploy e migration publicados continuam sujeitos a autorização explícita separada.

## Decisões externas necessárias, sem bloquear o trabalho independente

- Confirmar a regra comercial de inadimplência e o papel autorizado a contratar/cancelar em nome da clínica.
- Fornecer/autorizar ambiente Supabase descartável e contas sintéticas por perfil; nenhum teste autenticado deve apontar para produção.
- Responsável clínico para validar parâmetros e assinatura do laboratório.
- Acesso administrativo do domínio, Mercado Pago e Easypanel para verificar configurações; não compartilhar valores de secrets.
- Responsável jurídico/comercial para aprovar termos, SLA, preços e promessas públicas.

Enquanto uma dependência aguarda, continuam as correções locais independentes. Nenhuma dependência justifica alterar produção, migrar provedor ou tocar em dados de assinantes.

### 13/10/2026 — fortalecimento da prova de isolamento autenticado

- O teste `tests/isolamento-entre-clinicas.spec.ts` deixou de tratar listas vazias como evidência de RLS. Agora exige dois pacientes sintéticos próprios, comprova que cada conta lê o seu e que A não lê o paciente de B.
- Para agendamentos, prontuários, prescrições, lançamentos, retornos e NPS, a clínica B precisa ler ao menos um fixture próprio; em seguida, a clínica A tenta buscar os IDs exatos de B e deve receber zero linhas. IDs e valores clínicos não são impressos nos erros.
- ESLint passou. Playwright descobriu 11 cenários, todos pulados porque não há Supabase QA local nem variáveis/fixtures configurados. Isso valida somente que a suíte fica isolada sem ambiente; não prova isolamento no banco. A execução real segue pendente de ambiente descartável e fixtures por clínica.

### 13/10/2026 — correção de concorrência em platform-reprocess-job

- A Edge Function mantinha os cabeçalhos CORS numa variável de módulo compartilhada e os substituía ao iniciar cada requisição. Chamadas concorrentes podiam associar a resposta aos cabeçalhos de outra origem.
- Os cabeçalhos e o helper `reply` agora são locais ao handler da requisição; cada resposta usa a origem calculada para a própria chamada. Alteração limitada ao escopo de resposta, sem modificar autorização, dados ou comportamento de reprocessamento.
- Deno não está instalado globalmente neste checkout. A validação local será ESLint e diff; teste de concorrência da função implantada permanece pendente e nenhuma implantação foi feita.

### 13/10/2026 — correções locais após revisão de autorização de webhook

- Revisão estática confirmou que o roteamento de revogação agora compara `user_id` e `data.id` do corpo ao recurso da query autenticado e que rejeita inconsistência antes de criar log. Requisições internas de reprocessamento autenticadas mantêm compatibilidade com o ID do payload registrado.
- Cabeçalhos CORS do webhook passaram de variável de módulo compartilhada para escopo da requisição.
- Evidência: 22 testes Vitest de assinatura/roteamento, `deno check` da Edge Function, TypeScript, ESLint, e `git diff --check` passaram. Nenhuma validação de sandbox/produção foi feita.
- A assinatura do provedor não inclui `action` no manifest. A autenticidade da ação de revogação segue exigindo confirmação técnica adicional; não ampliar a confiança nesse fluxo até fechar esse ponto.

## Atualização de design — 13/10/2026

A captura desktop do Caixa Diário mostrou que a última aba ficava cortada em 1280 px. A faixa agora permite quebra em duas linhas, e o teste garante a visibilidade das oito opções em 1280×800 e 1440×900. A suíte de capturas também desativa animações para evitar quadros transitórios.

QA independente revisou as telas financeiras com estados vazios e com lançamentos sintéticos populados. Em Contas a Receber e Contas a Pagar, os estados vencido/parcial, pendente e pago, saldos, ações por linha e diálogos de confirmação foram verificados em 1280×800 e 1440×900; Playwright passou 1/1. As consultas de Mercado Pago Point limitaram-se a `list_terminals`/`list_orders`; não houve mutação fora do backend sintético. As quatro capturas foram revisadas. Descrições e fornecedores longos têm `title` para permitir consulta do texto completo quando visualmente truncados.

Na recuperação de `CaixaDiario.tsx`, QA independente confirmou que o diff atual contra `HEAD` contém apenas os blocos visuais de cabeçalho e abas, sem alterações de lógica/formulário. O estado local exato imediatamente anterior ao truncamento não foi encontrado, então sua equivalência não pode ser provada; esse limite permanece registrado no handoff.

O checkout de planos alinhou o `baseColor` do Card Payment Brick ao violeta da marca, mantendo verde nos estados de sucesso. A documentação oficial permite customizar essa variável. Playwright sintético passou 3/3, TypeScript e ESLint passaram e o detector Impeccable retornou `[]`. A integração externa do Brick não foi renderizada no teste local, que usa `public_key: null`; a verificação visual do botão no ambiente de teste segue pendente.

Nas capturas sintéticas de Contas a Receber, o eixo de Receita por Categoria repetia rótulos porque arredondava os valores para milhares inteiros. Agora exibe moeda completa abaixo de R$ 1.000 e milhares com uma casa decimal acima disso; a tooltip continua mostrando os valores completos. Playwright passou 1/1 em 1280×800 e 1440×900, verificando que os ticks são distintos; capturas revisadas, TypeScript e ESLint sem erros, detector Impeccable `[]`. Não houve gravações.

### 13/10/2026 — continuidade de design, jornada comercial e restauração

- A grade Dia da Agenda deixou de ter rolagem vertical própria; o `main` controla o eixo vertical, enquanto a grade mantém o eixo horizontal. O cabeçalho dos profissionais acompanha o scroll horizontal. Teste focal: 2/2; a spec Playwright permanente passou 1/1 nas larguras 1280×800 e 1440×900, verificando scroll vertical do `main`, grade sem segundo scroll vertical e cabeçalho sticky. QA Chromium sintético com 3 e 6 profissionais confirmou alinhamento horizontal e navegação por teclado.
- A jornada de venda corrigiu rótulos de frequência e duração trimestral/semestral, ação para conta Ultra, mensagem legada do checkout hospedado e scroll de `/#planos`. Vitest focal passou 26/26 e TypeScript passou. Limites dos planos continuam aguardando decisão comercial; não foram alterados preços, elegibilidade ou regras de cobrança.
- A restauração de arquivos passou a devolver `parcial` e registrar falhas de listagem de subpastas, em vez de reportar sucesso com uma árvore incompleta. Testes Deno sintéticos passaram 2/2 e `deno check` passou; nenhuma gravação em bucket, migration ou deploy ocorreu.
- `npm run build` passou. Para a validação de rotas autenticadas com fixtures, `npx vite build --mode test` e preview do bundle otimizado passaram Playwright 1/1 nas 31 telas e duas larguras desktop. O teste do bundle padrão de produção foi bloqueado pelo fixture ao tentar acessar endpoint externo, sem realizar chamada de produção.


### 13/10/2026 — guard de QA descartável e comparação do bundle PR15

- Corrigi `tests/isolamento-entre-clinicas.spec.ts` para exigir `QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE` antes de autenticar contas ou chamar a Edge Function de WhatsApp. A suíte já restringia o host a loopback, mas não exigia o marcador que distingue banco descartável. A variável de autorização não estava definida nesta sessão, então a integração cross-clinic foi deliberadamente pulada sem contato com Supabase; os testes unitários do helper passaram 4/4 e ESLint não reportou erros (3 avisos `any` preexistentes).
- Comparei localmente os 47 blocos de `PR15_MIGRATIONS_47.sql` com seus 47 arquivos versionados, removendo somente os `INSERT` de registro adicionados pelo bundle e wrappers `BEGIN/COMMIT` quando ausentes na fonte. 46 blocos coincidem byte a byte após normalização CRLF/LF; o único delta é parênteses ao redor de uma expressão `CASE` em `20261011160000`, sem mudança de expressão aparente. Isso comprova paridade textual local nesses limites, não aplicação, grants/RLS efetivos, segurança operacional nem ausência de dano dos DML destrutivos; o agregado continua sem autorização para VPS.
- A revisão independente confirmou riscos estáticos P1 em deleções históricas/`delete_all_app_data`, na migration que bane e cancela uma conta identificada localmente, e em RLS de diagnósticos até a migration corretiva ser aplicada/testada. Nenhum dos revisores consultou produção ou secrets; a aplicação remota continua desconhecida. Próximo passo continua sendo clone descartável com catálogo, grants, fixtures sintéticas A/B e comparação antes/depois; migrations de conta/remoção não devem ser executadas enquanto alvo e impacto contratual não estiverem comprovados.

## Jornada plano → onboarding — itens resolvidos localmente em 13/10/2026

Revisão independente de UX desktop em fixtures sintéticas identificou dois bloqueios P1 e sete itens P2/P3. Correções locais, sem deploy ou alteração de dados:

- Slug ausente/inativo no cadastro: explica indisponibilidade, mostra retorno aos planos e bloqueia cadastro com intenção quebrada.
- Troca de plano do comprador pendente: servidor permite outro slug desde que o catálogo confirme plano ativo; a intenção continua limitada à jornada de assinatura SaaS e os convites pendentes continuam protegidos. Pedido aberto de outro plano exige retomar/cancelar antes de iniciar nova contratação.
- Checkout: período mensal usa `/mês`; URL Pix não ignora uma recorrência ativa; trial solicitado e Pix agora explicam que o Pix cobra o período integral; indisponibilidade do cartão usa copy neutra e não mostra consentimento de trial sem cartão disponível.
- Landing: compra à vista explica que a forma será escolhida no checkout; modal usa Dialog acessível com foco, Escape e retorno ao CTA; estado sem planos distingue catálogo vazio de falha de carregamento.

Verificação: Deno 11/11; Vitest 29/29; TypeScript passou; Playwright `auth-plan-intent` 2/2; Playwright `plan-checkout-payment-options` 6/6. ESLint focal sem erros, 7 avisos preexistentes. Na primeira tentativa, o teste de slug indisponível usou um seletor `role=alert` ambíguo; ajuste feito no próprio teste e a spec passou na reexecução.

Pendente de validação por limite do ambiente: o Card Payment Brick não foi carregado (o teste usa public key nula/SDK de fora interceptado), portanto ainda é preciso verificar no sandbox se o submit do Brick fica inabilitado até o consentimento marcado. Também permanecem como observações não reproduzidas: destinos diferentes no cadastro sem plano e o critério da etapa "Configure sua equipe". O provisionamento pós-Pix exige gateway/webhook real de teste e segue fora desta verificação. Nenhuma migration, credencial ou ambiente remoto foi usado.


### Complemento do checkout — defesa no servidor

`create_card_subscription` agora verifica pedidos Pix abertos no backend e responde 409 antes da chamada ao gateway. O teste sintético simula Pix pendente para outro plano e confirma rejeição sem chamada externa. Resultado Deno atualizado: 12/12; TypeScript passou. Isso complementa o bloqueio visual em `/planos` e `PlanoCheckout`.

## Revisão de continuidade e prontidão — 13/10/2026

- Design: criado [DESIGN.md](../DESIGN.md) a partir dos tokens existentes de `src/index.css`, dos componentes compartilhados e do handoff “Clássico Premium”. Não houve troca de identidade visual. A Central de Suporte recebeu busca em título/descrição na fila inteira, filtros de status/prioridade por consulta, contagem paginada coerente e timestamp ampliado para 12px. Vitest focal 9/9, Playwright Chromium desktop 2/2, TypeScript, ESLint e build/PWA passaram; o detector Impeccable sinalizou inicialmente apenas o timestamp 10px, corrigido para a escala de 12px.
- LGPD: a exportação preparada pelo navegador não marca mais o pedido como `fulfilled`; permanece `pending` até conferência de escopo e entrega ao titular. A UI informa esse estado. Teste sintético do exportador 1/1, TypeScript, ESLint focal e build passaram.
- Release: a Edge Function de webhook depende de `claim_mercadopago_webhook`, definida na migration aditiva `20261013160000_mercadopago_webhook_atomic_claim.sql`. A migration está somente no checkout e não foi testada/aplicada em Postgres; não promover a função isoladamente. O isolamento real por RLS entre clínicas e perfis permanece sem prova porque o marcador de Supabase descartável não está configurado. O pacote LGPD continua parcial: blobs de Storage e cobertura de todas as relações/retentores ainda não foram validados; por isso o pedido fica pendente.
- Nenhum acesso a produção, deploy, migration, secret, dado de paciente ou escrita real foi executado nesta continuação. O checkout ainda contém grande volume de alterações locais; o diff completo deve ser revisto e separado por release antes de publicar qualquer coisa.

### Consentimento do teste grátis no checkout — 13/10/2026

Resolvido localmente: quando o teste grátis está selecionado, o formulário do cartão do Mercado Pago só é inicializado e montado depois da autorização explícita da cobrança recorrente. O callback do Brick continua validando o consentimento e o servidor continua validando a elegibilidade e a autorização. Playwright sintético do checkout passou 7/7; o sandbox MP passou 15/15 usando usuário de teste confirmado. Ainda falta validar com o SDK real do Brick em fluxo de navegador, pois o teste visual não carregou o SDK externo; a suíte sandbox cobre a API e as regras de cobrança, não a interação com o iframe.

### Cadastro sem plano — consistência do destino após confirmação — 13/10/2026

Resolvido localmente: callback de confirmação de cadastro sem plano, login iniciado a partir desse callback e retorno de MFA levam ao onboarding, igual ao cadastro com sessão imediata. Login comum segue ao Dashboard; plano escolhido segue ao checkout. Playwright sintético passou 3/3 para callback e intenção de plano; TypeScript passou. Sem criação de usuário ou acesso remoto.

O consentimento também é reiniciado ao mudar de plano/valor/período ou sair do cartão; voltar ao cartão exige nova confirmação. Playwright sintético do checkout atualizado: 8/8; build/PWA e TypeScript passaram.

### Onboarding — rótulo da etapa de equipe e acessos — 13/10/2026

Resolvido localmente: o primeiro cartão agora descreve acesso à clínica, não prontidão clínica. Administrador ativo satisfaz a etapa; convites são opcionais; cadastro de profissional e horários permanecem na etapa seguinte. CTA abre a gestão da equipe. Testes unitários 6/6, E2E solo sintético 1/1, TypeScript passou. Sem alteração do critério SQL ou dados.

Validação cruzada: a migration mais recente `20261013130000_onboarding_clinica_solo.sql` inclui o administrador ativo com função na contagem, substituindo uma versão anterior da RPC. A fixture sintética foi corrigida para contar 1 usuário e marcar a etapa como concluída. E2E solo 1/1 e capturas desktop 1280×800/1440×900 passaram/inspecionadas. A migration não foi aplicada remotamente.

### Cancelamento imediato — contrato local verificado — 13/10/2026

A copy de cancelamento imediato coincide com o código local: após resposta bem-sucedida do gateway, a Edge Function marca a assinatura MP e o plano como `cancelada`; `useSubscriptionPlan` mantém recursos somente para `ativa`/`trial`, e a interface invalida o cache. Teste Deno passou 12/12 e `deno check` passou. A validação não aprova termos legais nem comprova o comportamento da instância implantada.

### LGPD — anexos do prontuário no pacote de exportação — 13/10/2026

A exportação baixa os anexos ligados aos prontuários pela sessão autenticada e inclui o conteúdo em Base64 no JSON, removendo do pacote o caminho interno do Storage. A policy existente continua sendo a autoridade: falha ao ler qualquer anexo interrompe a exportação; acima de 30 MB acumulados, o fluxo também interrompe e orienta preparação assistida. O pedido permanece `pending` até a clínica conferir e entregar ao titular. A tela informa que arquivos externos e documentos anexados em outros módulos ainda exigem conferência manual; o pacote LGPD não é declarado completo.

Vitest sintético 3/3, TypeScript e ESLint focal passaram. Não foram acessados pacientes ou Storage reais. Revisar em ambiente descartável o acesso de admin e médico a prontuários assinados antes de considerar o fluxo completo; ainda faltam provar a cobertura de todas as relações e arquivos vinculados.

### LGPD — trilha de exportação clínica e paginação sem truncamento — 13/10/2026

A exportação agora pagina e ordena por ID as consultas de registros vinculados, evitando o limite padrão de linhas do PostgREST. Antes de ler o histórico, chama a RPC `registrar_exportacao_lgpd_paciente`, que valida o paciente na clínica e o papel/permissão do profissional e grava `acao='exportacao'`; a leitura de prontuário/Storage assinado aceita apenas evento recente do mesmo usuário (`visualizacao` ou `exportacao`). A RPC atualiza a trilha e não simula uma visualização humana.

Evidência local: Vitest focal LGPD/auditoria/paginação 13/13, TypeScript, ESLint focal (sem erros) e build/PWA passaram. A migration `20261013170000_auditoria_exportacao_lgpd_prontuarios.sql` não foi aplicada; confirmar a lógica RLS e o download de arquivo assinado em banco descartável antes de liberar o fluxo. O pacote ainda não cobre automaticamente todos os documentos armazenados por outros módulos e precisa de inventário.

### Design system — Indicadores de produtividade e alto contraste — 13/10/2026

Os cartões de Indicadores de Produtividade usavam tons hex fixos por tipo de métrica, que não acompanhavam a preferência pessoal de alto contraste e fugiam do sistema visual compartilhado. Os cartões e superfícies agora usam tokens semânticos do tema (`border`, `card`, `foreground`, `muted-foreground` e `primary`), mantendo os ícones e o conteúdo.

Vitest sintético 1/1 e Playwright Chromium 1/1 (1280×800 e 1440×900, seis métricas, alto contraste); TypeScript e ESLint focal sem erros. Capturas inspecionadas, sem overflow. Não houve mudança de consultas ou regras de cálculo.

### Cobertura estrutural de rotas desktop — 88 rotas em 1280×800 e 1440×900 — 13/10/2026

A spec autenticada de rotas agora percorre os mesmos 88 destinos nos dois breakpoints desktop. Em cada rota verifica título H1, conteúdo mínimo, rota canônica pós-redirect, texto de bloqueio, erros JavaScript, overflow e isolamento das chamadas pelo fixture sintético. Chromium passou 1/1, totalizando 176 verificações de rota/largura. A verificação não substitui a inspeção visual detalhada por tela; esta continua coberta por cenários específicos.

### QA Playwright final — correções de a11y, landing e fixtures — 13/10/2026

O E2E amplo local (Chromium) passou 206 testes, teve 46 ignorados por dependerem de credenciais/ambiente descartável e não teve falhas. Na rodada anterior foram corrigidos: nome acessível do diálogo do trial, alvos menores que 40 px na landing, seletores de login desatualizados nos testes, dados inválidos de prioridade na fixture da agenda e asserções antigas do fluxo LGPD que esperavam status `fulfilled`. O pedido continua `pending` até conferência e entrega formal.

Repetição focal dos cenários corrigidos: 3/3; o teste de exportação LGPD passou novamente após ajuste de fixture. A validação final também compilou o build/PWA mais recente, `75276acec70204f4`. A versão pública consultada informou `18f672af…`; isso comprova um build ativo, mas não vincula o deploy informado ao build local atual. Nenhum deploy, migration ou escrita em produção foi feito nesta etapa.

### FHIR — conferir escopo do laudo antes de assinar URL — 13/10/2026

O exportador FHIR usa `service_role` para criar URLs temporárias de Storage, que ignora RLS. Antes de assinar, agora valida que o objeto usa um layout conhecido e está vinculado ao paciente selecionado: `exames/<paciente>/<arquivo>`, o legado `<clínica>/<paciente>/<arquivo>`, ou `<prontuário>/<arquivo>` quando o prontuário aparece na consulta RLS daquele paciente. URLs, caminho de outra clínica/paciente, traversal, segmentos vazios e formatos não reconhecidos interrompem a exportação inteira antes de qualquer assinatura. A revisão encontrou também que `LancarResultado` enviava arquivos para `<clínica>/<paciente>/<arquivo>`, enquanto a policy versionada só aceita o prefixo `exames/<paciente>/...`; o upload agora usa esse prefixo reconhecido pela policy. O Portal do Paciente também usava `service_role`; agora aceita só caminhos pertencentes ao paciente ou URLs internas do bucket esperado, revalida o caminho e gera uma URL nova curta. Links externos, bucket diferente ou arquivo de outro paciente ficam ocultos como indisponíveis.

Validação local: Deno 5/5, `deno fmt --check`, `deno check` de FHIR e Portal, teste Vitest de contrato do portal + upload 5/5 e TypeScript passaram. Sem leitura de banco/Storage ou deploy. A confirmação de formatos históricos em dados reais e a matriz RLS/Postgres descartável continuam pendentes; caminhos não reconhecidos falham fechados e exigem tratamento assistido até essa confirmação.
