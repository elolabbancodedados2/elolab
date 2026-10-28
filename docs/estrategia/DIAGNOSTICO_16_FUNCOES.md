# EloLab: diagnóstico consolidado das 16 funções

Data: 27/10/2026
Autor: `clinical-quality-director` (consolidação e verificação por amostragem)
Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, com 199 arquivos alterados e não commitados. As linhas citadas valem para esse estado do worktree. Fiz só leitura: sem migrations, deploy, SSH, commit ou acesso à produção.

Fontes consolidadas:

- `docs/estrategia/funcoes/01-produto-dominio.md` (PM, PO, BA, Especialista de Domínio), IDs 101–115
- `docs/estrategia/funcoes/02-engenharia.md` (Arquiteto, Tech Lead, Front, Back, DBA), IDs 201–218
- `docs/estrategia/funcoes/03-seguranca-qa-sre.md` (Segurança, QA, DevOps/SRE), IDs 301–320
- `docs/estrategia/funcoes/04-ux-gtm.md` (UX Research, Designer, Growth, Sales/CS), IDs 401–420

Legenda de verificação:

- **CONFIRMADO PELO DIRETOR**: abri o arquivo citado e o código sustenta o achado.
- **CONFIRMADO (código) / NÃO VERIFICADO (produção)**: o código sustenta o achado, mas o efeito depende do estado real da VPS, que não acessei.
- **SÓ RELATADO**: vem dos relatórios e não foi reaberto nesta rodada.
- **REBAIXADO / DERRUBADO**: a evidência não sustenta a gravidade original.

## Índice

0. [Visão por função](#0-visão-por-função)
A. [Resumo executivo](#a-resumo-executivo)
B. [Maturidade por evidência](#b-maturidade-por-evidência)
C. [Mapa de jornadas](#c-mapa-de-jornadas)
D. [Backlog consolidado](#d-backlog-consolidado)
   - D.1 [Verificação por amostragem](#d1-verificação-por-amostragem)
   - D.2 [Divergências entre os relatórios](#d2-divergências-entre-os-relatórios)
   - D.3 [P0 e P1](#d3-p0-e-p1)
   - D.4 [P2 e P3](#d4-p2-e-p3)
   - D.5 [Mapa de deduplicação](#d5-mapa-de-deduplicação)
E. [Oportunidade frente aos concorrentes](#e-oportunidade-frente-aos-concorrentes)
F. [Roadmap 7/30/60/90 dias e 6 meses](#f-roadmap-7306090-dias-e-6-meses)
G. [Veredito de lançamento](#g-veredito-de-lançamento)
H. [Ações não realizadas](#h-ações-não-realizadas)

---

## 0. Visão por função

Os IDs entre parênteses são os consolidados da seção D (`CLIN-QA-0xx`).

| # | Função | Principais achados | Prioridade máxima | Próximo passo concreto |
|---|---|---|---|---|
| 1 | Product Manager | Não há TISS XML nem ICP-Brasil, que separam o plano de entrada do plano médio no mercado. A landing promete código de barras que não existe. Os segmentos rede, laboratório e odonto dependem de módulos inexistentes (010, 011, 013, 024, 025) | P1 | Congelar a venda de redes, laboratório e odonto como produto pronto. Publicar os gates da seção F |
| 2 | Product Owner | Agendamento público vincula o paciente só pelo CPF. WhatsApp vincula pelo final do telefone. Autorização de convênio promete uma resposta que o sistema não recebe (003, 023) | **P0** | Escrever a história "identificação em dois fatores (CPF + nascimento) em todo canal público", com os critérios de aceite do 003 |
| 3 | Business Analyst | Todas as 13 jornadas estão NÃO EXECUTADO. Repasse e migrations de 24/10 não aplicados em produção. Exclusão LGPD apaga dado clínico (004, 006) | **P0** | Montar o roteiro de smoke das 13 jornadas em homologação com dados sintéticos |
| 4 | Especialista de domínio (clínica, lab, odonto) | Verificador de interações com 11 pares e silêncio quando não acha par. Quem valida o laudo também libera. Não há odontograma nem interfaceamento (021, 022, 025, 026) | P1 | Avaliação especializada: escopo do verificador de interações e segregação de funções no laboratório |
| 5 | Arquiteto | Tenant de um nível (`clinica_id`), papel global em `user_roles`, `profiles.clinica_id` escalar. Proposta expand/contract com `organizacoes` e `membros_unidade` (008, 024) | P1 | ADR da arquitetura multiunidade e do modelo de papéis por unidade, sem migrar nada ainda |
| 6 | Tech Lead | 454 migrations aplicadas à mão pelo SQL Editor, versão duplicada `20261010198000`, drift com a VPS, CI fazendo `link` com projeto Cloud (006) | P1 (gate) | Gerar o diff de schema produção × repositório, só leitura, e anexar ao backlog |
| 7 | Frontend | Entre 597 e 673 chamadas `.from()` (depende do critério), cerca de 275 `(supabase as any)`, 401 de 581 `queryKey` sem tenant, 10 telas com mais de 1.300 linhas (014, 031) | P1 | Fábrica `qk` com tenant no primeiro segmento e limpeza do cache na impersonação |
| 8 | Backend | IA síncrona no webhook do WhatsApp, chave Evolution global, replay no webhook do Mercado Pago, rate limit que falha aberto (009, 027) | P1 | Webhook do WhatsApp responde em menos de 1 s e enfileira o processamento |
| 9 | DBA | Funções `SECURITY DEFINER` novas herdam `EXECUTE` para anon. Quatro formas de policy. Nenhum `(select auth.uid())` (001, 032) | **P0** | Rodar na VPS, em modo leitura, a consulta de `has_function_privilege('anon', …)` e anexar o resultado |
| 10 | Segurança | `link_portal_paciente` e `platform_get_clinicas_saude` pulam a checagem quando `auth.uid()` é nulo. MFA exigido só no cliente. Convite troca a clínica e acumula papéis (001, 007, 008) | **P0** | Revogar anon, com allowlist, e criar `ALTER DEFAULT PRIVILEGES` (com autorização do responsável) |
| 11 | QA | `tsc` e 1.117 testes unitários passam (relato do 03), mas as suítes de isolamento, RLS e RBAC são puladas no CI por falta de banco (002) | **P0** | Job de CI com `supabase start`, seed de duas clínicas e falha quando houver skip |
| 12 | DevOps/SRE | Backup na própria VPS, sem restauração testada, sem PITR, sem staging, sem observabilidade nem runbooks (005, 015) | **P0** | Backup off-site criptografado e primeira restauração cronometrada em VM descartável |
| 13 | UX Research | Nenhum teste com usuário. Todas as conclusões de UX são hipótese. Roteiro de 5 perfis × 5 tarefas pronto no 04 (012, 019) | P1 | Recrutar 5 recepcionistas e 5 médicos para sessões em homologação |
| 14 | Designer | Faixa de identificação do paciente com nome em 10 px, sem data de nascimento e sem alergias. CPF completo exposto. Texto com mojibake (012, 018, 031) | P1 | Componente `PatientIdentityBar` especificado, com nome, nascimento e alergias |
| 15 | Growth | Nenhum analytics, nenhuma UTM, trial de 3 dias com cartão, sem landing por segmento (016, 033) | P2 | Plano de eventos com consentimento e definição de ativação aprovados |
| 16 | Sales/CS | Demo estática, sem NPS, status page, health score, SLA medido ou prova social (033) | P2 | Clínica de demonstração com dados sintéticos e reinício diário |

---

## A. Resumo executivo

1. **Estágio real:** produto funcional e amplo em código (agenda, recepção com cobrança atômica, prontuário com assinatura verificável, laboratório com liberação protegida no servidor, financeiro, portal, WhatsApp com IA). Nenhuma jornada foi executada ponta a ponta nesta auditoria. É um beta técnico em produção, não um produto pronto para escala.
2. **Vantagem potencial:** clínica + coleta/laudo + atendimento por IA no WhatsApp num só sistema, com check-in que gera a cobrança na mesma transação. A hipótese de valor precisa de medição em clínicas reais (seção E).
3. **Bloqueios (P0):**
   - **001:** RPCs `SECURITY DEFINER` que pulam a checagem de tenant quando chamadas por anon e não revogam anon. `link_portal_paciente` pode emitir link de portal de qualquer paciente. Código confirmado; grant real na VPS não verificado.
   - **002:** isolamento entre clínicas e RBAC nunca executados. As suítes existem e são puladas no CI.
   - **003:** canais públicos vinculam o paciente errado: agendamento só pelo CPF, WhatsApp pelos últimos 8–9 dígitos do telefone, com `limit 1`.
   - **004:** a exclusão LGPD apaga prontuário, prescrição e exames em laço não transacional no cliente.
   - **005:** backup no mesmo host, sem restauração testada nem PITR. Uma perda da VPS é irreversível.
4. **Veredito:** NO-GO para escala e novos segmentos. GO CONDICIONAL para um beta com pequenas clínicas depois que os cinco P0 fecharem (seção G).

---

## B. Maturidade por evidência

Escala: 0 ausente; 1 parcial ou não integrado; 2 operacional sem prova suficiente ou com lacunas; 3 implementado, testado e validado em operação.

| Área | Autoavaliação | Avaliação por evidência | Prova (path) | Lacuna principal | Divergência |
|---|---|---|---|---|---|
| Produto | 2 | **2** | Jornadas implementadas (01 §1); `src/lib/checkinWithBilling.ts`; `supabase/migrations/20261011180000_integridade_tenant_laboratorio.sql:396-412` | Nenhuma jornada executada; TISS, ICP, código de barras, odontograma, multiunidade e NFS-e inexistentes; landing promete o que não existe (`src/pages/LandingPage.tsx:209`) | igual |
| UX | 1 | **1** | `ErrorState` por consulta (`src/pages/Recepcao.tsx:1174-1179`); faixa de identificação fraca (`src/pages/Prontuarios.tsx:2069-2080`) | Zero teste com usuário; 100 usos de texto em 10–11 px; mojibake em 11 arquivos no HEAD | igual |
| Arquitetura | 2 | **1** | `user_roles` sem `clinica_id` (`20260131002504…sql:43-50`); versão duplicada `20261010198000`; aplicação manual (`supabase/APLICAR_MIGRATIONS.md`) | Repositório ≠ produção (drift); tenant de um nível; dados acessados direto nas telas | **−1** |
| Segurança | 2 | **1** | Correções reais de policies (03 §1); HMAC do Mercado Pago; tokens do portal em hash. Contra: `20261011010000…sql:17-35,60-61`; MFA só em `src/pages/Auth.tsx:150-160` | P0 suspeito de anon em RPCs; MFA contornável; isolamento sem prova | **−1** |
| QA | 2 | **2** | `tsc` 0 erros e vitest 1.117/1.117 (03 §4, comando e resultado relatados, não reexecutados por mim) | Suítes de isolamento, RLS e RBAC puladas (`.github/workflows/test.yml` sem `QA_*`; `scripts/test-supabase-env.ts:40-46`) | igual |
| Comercial | 0 | **1** | Planos Pro/Ultra (`20261010230000…sql:6,14`), checkout Mercado Pago, trial, landing | Sem analytics, UTM, demo navegável, prova social, preço validado | **+1** |
| Operação | 0 | **1** | Produção rodando na VPS; `notification_queue` com retentativas; `auto-backup`; painel de saúde por clínica; watchdog | Backup no mesmo host (`supabase/functions/auto-backup/index.ts:131-170`); sem PITR, staging, observabilidade e runbooks | **+1** |
| **Total** | **9/21** | **9/21** | | | distribuição diferente |

**Leitura:** o total coincide, mas a distribuição não. A autoavaliação superestima arquitetura e segurança, justamente onde estão os P0, e subestima comercial e operação, onde existe base funcionando. Nenhuma área chega a 3, porque nenhuma tem validação operacional comprovada.

---

## C. Mapa de jornadas

Nenhuma jornada foi executada em navegador ou contra banco nesta auditoria. "Teste unitário" significa que existe teste no repositório; o 03 relatou que a suíte inteira passou (`vitest`, 1.117 testes), sem banco real.

| Jornada | Status | Evidência principal | Teste no repositório | Risco aberto |
|---|---|---|---|---|
| Contratar e ativar | NÃO EXECUTADO | `supabase/functions/public-checkout/index.ts:47,76`; `src/components/SubscriptionGuard.tsx:36` | `planCheckout`, `platformPlanOrders`, `mercadoPagoWebhookRouting` | Ativação paga sem vínculo de e-mail (028); trial de 3 dias |
| Marcar (interno) | NÃO EXECUTADO | `src/components/agenda/AppointmentDialog.tsx:159-201`; constraints anti-sobreposição | sim | — |
| Marcar (link público) | NÃO EXECUTADO | `supabase/functions/public-booking/index.ts:197-198` | não | **Paciente errado pelo CPF (003)** |
| Marcar (WhatsApp) | NÃO EXECUTADO | `supabase/functions/whatsapp-webhook/index.ts:173-179,886-890,993` | não | **Paciente errado pelo telefone (003)** |
| Confirmar | NÃO EXECUTADO | `patient-portal/index.ts:795,853`; `appointment-confirmation/index.ts:144-160` | parcial | Emojis no template (018) |
| Recepcionar (check-in + cobrança) | NÃO EXECUTADO | `src/lib/checkinWithBilling.ts:35-97` | `checkinWithBilling.test.ts` | Código de `tipo_consulta_id` não publicado (006) |
| Atender | NÃO EXECUTADO | `src/lib/operationalTransitions.ts:60,96,120` | `operationalTransitions.test.ts` | — |
| Registrar prontuário | NÃO EXECUTADO | `DigitalSignature.tsx:79`; integridade do assinado em `20261011160000…sql:38` | `prontuarioAuditReadCoverage` | Identificação fraca na edição (012); sem ICP (011) |
| Prescrever | NÃO EXECUTADO | Memed em homologação (`memed-prescription/index.ts:46,65`) | parcial | Memed fora de produção; verificador de interações limitado (021) |
| Solicitar exame | NÃO EXECUTADO | `src/pages/laboratorio/PedidosLaboratorioPanel.tsx:137` | parcial | — |
| Coletar e laudar | NÃO EXECUTADO | `MapaColeta.tsx:311`; liberação exige `validado` (`20261011180000…sql:396-412`) | `laudoWorkflow`, `mapaColetaWorkflow` | Etiqueta só em texto (013); mesmo perfil valida e libera (022) |
| Etiqueta com código de barras | **NÃO EXISTE** | `src/pages/MapaColeta.tsx:346-347` imprime texto; `Barcode` em `Laboratorio.tsx` é só ícone | — | Promessa na landing (013) |
| Cobrar no caixa | NÃO EXECUTADO | `CaixaDiario.tsx:657,686`; estorno em `ContasReceber.tsx:592` | parcial | Diálogo de pagamento sem nome explícito do paciente (012) |
| Pix do paciente e NFS-e | **NÃO EXISTE** | 0 ocorrências de `nfse`/`nfs-e` em `src` e `supabase/functions` | — | 025 |
| Faturar convênio (TISS XML) | **NÃO EXISTE** | `src/pages/FaturamentoConvenios.tsx:335`: "não é arquivo TISS de transmissão" | — | 010 |
| Repassar | NÃO EXECUTADO | `src/pages/RepassesMedicos.tsx:61,124,163` | parcial | Migrations de 24/10 não aplicadas (006) |
| Relatórios | NÃO EXECUTADO | `src/App.tsx:309-310`; `AnalisePreditiva.tsx:175` se declara heurística | parcial | — |
| Cancelar consulta | NÃO EXECUTADO | `AppointmentCard.tsx:151` | parcial | — |
| Cancelar assinatura e exportar | NÃO EXECUTADO | `mercadopago-checkout/index.ts:116`; `ExportacaoClinicaProtegida` | parcial | Retenção do prontuário após churn: requer avaliação especializada |
| Exclusão LGPD do titular | NÃO EXECUTADO | `src/lib/lgpdCompliance.ts:134-189` | não | **Apaga dado clínico (004)** |
| Isolamento entre clínicas | NÃO EXECUTADO (suíte pulada) | `tests/isolamento-entre-clinicas.spec.ts`; CI sem `QA_*` | existe, não roda | **002** |
| Restauração de backup | NÃO EXECUTADO | `auto-backup/index.ts` grava no Storage da própria VPS | não | **005** |
| Multiunidade, odontograma, interfaceamento | **NÃO EXISTE** | 0 ocorrências de `unidade_id` e `odontograma` em `src` e `supabase/migrations` | — | 024, 025, 026 |

**Reversão e concorrência.** Há proteção real em alguns pontos: check-in e cobrança atômicos, anti-sobreposição no banco, `FOR UPDATE` em `link_portal_paciente`, idempotência por `event_id` no Mercado Pago e por `message_id` no WhatsApp. A exclusão LGPD é o contraexemplo: não é atômica e deixa estado parcial.

---

## D. Backlog consolidado

### D.1 Verificação por amostragem

Abri 16 evidências P0/P1. Resultado: 13 confirmadas, 2 rebaixadas e 1 com ressalva.

| # | Achado (IDs de origem) | Arquivo:linha conferido | O que encontrei | Resultado |
|---|---|---|---|---|
| 1 | `link_portal_paciente` com anon (301) | `supabase/migrations/20261011010000_portal_paciente_scoped_links.sql:17-20,32-35,60-61` | As duas checagens só valem `IF auth.uid() IS NOT NULL`. Só há `REVOKE … FROM PUBLIC` e `GRANT … TO authenticated`. A função nasceu em `20260817200000…sql:99`, depois da revogação em massa de `20260728041952…sql:4-29`, e não existe `ALTER DEFAULT PRIVILEGES` em nenhuma migration | CONFIRMADO (código) / NÃO VERIFICADO (produção) |
| 2 | `platform_get_clinicas_saude` com anon (303) | `20260817210000…sql:127-128`; `20260817240000…sql:44` | Mesmo padrão: criada depois de 28/07, sem revogação de anon, checagem só quando `auth.uid()` não é nulo | CONFIRMADO (código) / NÃO VERIFICADO (produção) |
| 3 | Helpers com `GRANT … anon` (203) | `20260508172810…sql:1-13` | O grant existe, mas é anterior à revogação em massa de 28/07, que percorre todas as funções `prosecdef`. `is_same_clinica` teve anon revogado de novo (`20260923100000…sql:31`). Não achei `DROP FUNCTION` posterior dessas helpers. Sem `auth.uid()` elas não devolvem dado útil | **REBAIXADO de P0 para P3**, incorporado ao 001 |
| 4 | Papel global (202) | `20260131002504…sql:43-50`; `20260729120000…sql:1-33` | `user_roles` sem `clinica_id`, `UNIQUE(user_id, role)`. O vazamento de 29/07 foi corrigido com escopo via `user_in_same_clinica`. Não há vazamento ativo comprovado | **REBAIXADO de P0 para P1** (bloqueio estrutural de rede), fundido com 314 no 008 |
| 5 | Agendamento público por CPF (102, 306) | `supabase/functions/public-booking/index.ts:196-198,239` | `buscarPacientePorCpf` reaproveita o paciente sem conferir nome nem nascimento. Nome e telefone informados vão só para `observacoes` | CONFIRMADO PELO DIRETOR; **elevado a P0** pela rubrica (paciente errado) |
| 6 | WhatsApp por telefone (103) | `whatsapp-webhook/index.ts:173-179,886-890,993` | `ilike` com os últimos 8 ou 9 dígitos, `.limit(1)` sem ordenação. A consulta de agendamentos devolve `medicos(crm, especialidade)`, contrariando o próprio comentário de `:334-335`. O agendamento é inserido em `conversation.paciente_id` | CONFIRMADO PELO DIRETOR; **elevado a P0** |
| 7 | Exclusão LGPD (307) | `src/lib/lgpdCompliance.ts:134-142,170-189`; chamada em `src/pages/LgpdPacientes.tsx:70` | Apaga `anexos_prontuario`, `prescricoes`, `exames`, `triagens`, `prontuarios`, `agendamentos` e `pacientes` em laço no cliente. Em caso de falha, continua e informa "exclusão incompleta" depois de já ter apagado | CONFIRMADO PELO DIRETOR; **elevado a P0** (perda irreversível de dado clínico) |
| 8 | MFA só no cliente (304) | `src/pages/Auth.tsx:150-160`; grep por `aal` em `supabase/` | A checagem de AAL é feita só na tela. Nenhuma policy ou função lê `aal` | CONFIRMADO PELO DIRETOR |
| 9 | Isolamento não roda no CI (101, 305) | `.github/workflows/test.yml:70`; `scripts/test-supabase-env.ts:40-46` | O CI faz `supabase link --project-ref gebygucrpipaufrlyqqj`. Nenhuma variável `QA_*` no workflow. Sem URL loopback a suíte devolve `null` e é pulada | CONFIRMADO PELO DIRETOR |
| 10 | Backup no mesmo host (308) | `supabase/functions/auto-backup/index.ts:131-170` | Lista e copia buckets do próprio Storage para o bucket `backups` da mesma instância | CONFIRMADO PELO DIRETOR. Backups do Easypanel: NÃO VERIFICADO |
| 11 | Faixa de identificação no prontuário (401) | `src/pages/Prontuarios.tsx:2069-2080` | Nome em `text-[10px]`, idade como `42a`, CPF completo, sem nascimento e sem alergias | CONFIRMADO PELO DIRETOR |
| 12 | Código de barras prometido (105) | `src/pages/LandingPage.tsx:90,209`; `src/pages/MapaColeta.tsx:346-347` | A landing (`:209`) promete "rastreabilidade de amostras por código de barras". A etiqueta imprime o código em texto monoespaçado. Nenhuma biblioteca de código de barras em `src` | CONFIRMADO PELO DIRETOR |
| 13 | TISS inexistente (110, 208) | `src/pages/FaturamentoConvenios.tsx:333-337` | O próprio XML gerado diz "não é arquivo TISS de transmissão" | CONFIRMADO PELO DIRETOR |
| 14 | Drift e deploy manual (104, 201) | `ls supabase/migrations` | 454 arquivos, prefixo `20261010198000` duplicado | CONFIRMADO PELO DIRETOR (repositório). Drift na VPS: SÓ RELATADO (`docs/AUDITORIA_MODULOS_QA.md`) |
| 15 | Mojibake e exclamação (405) | `src/components/OnboardingWizard.tsx:45-46` | `ConfiguraÃ§Ã£o concluÃ­da` está no worktree. No `HEAD` a linha é "Tudo pronto!". A corrupção veio de alteração local não commitada. No HEAD há mojibake em 11 arquivos de `src`; no worktree, em 12 | CONFIRMADO, com ressalva: parte é regressão local |
| 16 | Rate limit falha aberto (312) | `supabase/functions/_shared/rateLimit.ts:43-58` | Em erro do banco devolve "pode passar"; o IP vem de `x-real-ip`/`x-forwarded-for` | CONFIRMADO PELO DIRETOR (P2 mantido) |

Também confirmei que `ai-medical-assistant` não é chamada por nenhum arquivo de `src` (107).

### D.2 Divergências entre os relatórios

Não escolhi números. Registro os critérios para que a linha de base seja refeita com um script versionado (ação 031).

| Métrica | Relatório | Número | Critério | Minha recontagem (worktree) |
|---|---|---|---|---|
| Chamadas `.from()` | briefing | ~550 | não informado | — |
| | 02 | 598 (400 em pages/components) | `.from(` em `src` | 597 com `.from('`/`.from("` fora de testes; 659 com `.from(` fora de testes; 673 em todo `src` (inclui `Array.from` e testes) |
| Cores fixas | briefing | 1.118 | não informado | — |
| | 02 | 1.469 | `bg/text/border-<cor>-NNN` ou `#RRGGBB` em `.tsx` | — |
| | 04 | 1.480 (416 + 1.064) | classes de paleta + hex em `.tsx` | 1.474 (410 de `bg/text/border` + 1.064 hex) |
| `(supabase as any)` | 02 | 273 | grep | 275 (o worktree mudou) |
| Linha do `db lint` no CI | 02 / 03 | `test.yml:70` / `test.yml:51` | — | `:70` no worktree |
| `unidade_id` | 01 / 04 | só `ContasPagar.tsx` / nenhuma relevante | grep | 0 em `src` e `supabase/migrations` |
| Preço Feegow | 01 / 04 | R$129/199/249 por profissional / site recusou TLS | coleta em 27/10 | não reverificado |
| Gravidade do drift | 01 / 02 / 03 | P1 / **P0** / P2 | — | Decisão: **P1 com gate** (006) |
| Gravidade do papel global | 02 | P0 | — | Decisão: P1 (008) |
| Gravidade do ICP | 01 / 02 | P1 / P2 | — | Decisão: P1 comercial (011) |
| Identificação do paciente | 01, 03 / 04 | P1 / P1 a reavaliar | — | Canais públicos: **P0** (003). Prontuário: P1 (012) |
| Analytics e trial | 04 | P1 | — | Decisão: P2 comercial. Não são defeito de qualidade pela rubrica |

### D.3 P0 e P1

Dono sugerido por papel, não por pessoa. Esforço: S até 3 dias, M até 2 semanas, L mais de 2 semanas.

| ID | P | Título e origem | Impacto clínico ou comercial | Reprodução | Evidência | Causa provável | Proposta | Esf. | Teste de aceite | Dono | Verificação |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CLIN-QA-001 | **P0** (suspeito) | RPCs `SECURITY DEFINER` acessíveis a anon que pulam a checagem de tenant (301, 302, 303, 313, 203) | anon gera link de portal válido por 1 ano para qualquer `paciente_id` e lê a saúde de todas as clínicas. Vazamento cross-tenant. Mitigante: exige conhecer o UUID do paciente | `POST /rest/v1/rpc/link_portal_paciente` só com a anon key e `p_paciente_id`; idem `platform_get_clinicas_saude` | `20261011010000…sql:17-35,60-61`; `20260817210000…sql:127-128`; `20260817240000…sql:44`; ausência de `ALTER DEFAULT PRIVILEGES` | Privilégio padrão do Supabase dá `EXECUTE` a anon; a revogação de 28/07 foi pontual | (1) Consulta só leitura na VPS: `select proname from pg_proc where prosecdef and has_function_privilege('anon', oid, 'execute')`. (2) Migration com `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon, public`, revogação em massa e allowlist explícita. (3) Trocar `IF auth.uid() IS NOT NULL` por exigência de `auth.uid()` ou `pg_trigger_depth() > 0` | S | A consulta devolve só a allowlist; chamada anon às duas RPCs retorna `42501`; teste no CI cobre a allowlist | DBA + Segurança | CONFIRMADO (código) / NÃO VERIFICADO (produção) |
| CLIN-QA-002 | **P0** (gate) | Isolamento entre clínicas e RBAC sem prova executada (101, 305, 204, parte de 202) | Vazamento entre clínicas não descartado. Bloqueia qualquer venda em escala | Ver o job do CI: as suítes são *skipped* | `.github/workflows/test.yml:70`; `scripts/test-supabase-env.ts:40-46`; `tests/isolamento-entre-clinicas.spec.ts:114` (`.filter(Boolean)` ignora `clinica_id` nulo) | CI anterior ao self-hosted | `supabase start` no runner, seed com duas clínicas e cinco perfis; rodar `isolamento`, `rls` e `perfis-rbac`; job falha quando houver skip; incluir RPCs, Storage, Realtime, UPDATE e DELETE cross-tenant; não descartar linhas com `clinica_id` nulo | M | Job verde com mais de 0 testes executados e 0 skip; um PR que remove uma policy quebra o CI | QA + Tech Lead | CONFIRMADO PELO DIRETOR |
| CLIN-QA-003 | **P0** | Paciente errado nos canais públicos (102, 306, 103, 310) | Consulta gravada no cadastro de outra pessoa; o bot do WhatsApp pode revelar a especialidade do médico e agendar em nome de outro paciente que tenha telefone com o mesmo final | (a) Link público com CPF existente e outro nome. (b) Dois pacientes cujos telefones terminam nos mesmos 8 dígitos; mensagem do segundo número | `public-booking/index.ts:196-198`; `whatsapp-webhook/index.ts:173-179,886-890,993`; `patient-portal/index.ts:129-137` (SÓ RELATADO) | Identificação por um único dado | Link público: exigir CPF + data de nascimento iguais; se divergir, criar pré-cadastro pendente para a recepção. WhatsApp: não vincular por telefone; pedir CPF + nascimento antes de qualquer consulta ou ação; remover `medicos(crm, especialidade)` do retorno. Portal: dependente só com vínculo confirmado pela clínica | M | CPF existente com nascimento divergente não vincula e gera pendência; dois pacientes com mesmo final de telefone: o bot pede identificação e não revela nem cria agendamento | PO Agenda + Backend + DPO | CONFIRMADO PELO DIRETOR (a, b); portal SÓ RELATADO |
| CLIN-QA-004 | **P0** | Exclusão LGPD apaga dado clínico, sem atomicidade (307) | Perda irreversível de prontuário não assinado, prescrições, exames e anexos; conflito com a guarda de 20 anos (Lei 13.787/2018: requer avaliação jurídica) | Em homologação: excluir um paciente com prontuário não assinado em `/lgpd-pacientes` | `src/lib/lgpdCompliance.ts:134-142,170-189`; `src/pages/LgpdPacientes.tsx:70` | Direito ao esquecimento implementado como DELETE | Imediato: esconder a ação de exclusão. Depois: RPC transacional de anonimização que preserva o prontuário e mascara identificadores, com aprovação dupla e registro | S (bloqueio) + M (RPC) | Após o pedido, o prontuário continua íntegro, identificadores mascarados, e uma falha no meio não deixa estado parcial | Backend + DPO | CONFIRMADO PELO DIRETOR |
| CLIN-QA-005 | **P0** (risco latente) | Backup no mesmo host, sem restauração testada nem PITR (308, 309, SRE 1–3) | Perda da VPS = perda irreversível do dado clínico de todas as clínicas | — | `supabase/functions/auto-backup/index.ts:131-170`; `docs/EASYPANEL-VPS.md:34-35` (SÓ RELATADO) | Infra de uma VPS só | `pg_dump`/pgBackRest criptografado para R2/S3 em outra região, chave fora da VPS; WAL contínuo; restauração mensal em VM descartável | M | Relatório de restauração com RTO medido ≤ 4 h e contagens/checksums conferidos; PITR restaurado em timestamp escolhido (RPO ≤ 5 min) | SRE | CONFIRMADO PELO DIRETOR (código); backups do Easypanel NÃO VERIFICADO |
| CLIN-QA-006 | P1 (gate) | Repositório ≠ produção: drift de schema, deploy manual, versão duplicada, CI ligado ao Cloud, sem staging (104, 201, 204, 309, 318, SRE 4 e 7) | Funções falham em produção (histórico de encaminhamentos); nenhuma correção de segurança pode ser dada como aplicada | `supabase migration list --db-url` contra a VPS | `supabase/APLICAR_MIGRATIONS.md:1-10` (SÓ RELATADO); prefixo duplicado `20261010198000`; `docs/AUDITORIA_MODULOS_QA.md:60-78` (SÓ RELATADO) | Aplicação pelo SQL Editor | Diff schema-only produção × `db reset`; baseline + `migration repair` com backup; deploy de banco por pipeline com aprovação; staging com dados sintéticos | M | Diff vazio; versões únicas; `check:colunas` sem divergência; staging recebe as mesmas migrations | Tech Lead + DBA | CONFIRMADO parcialmente |
| CLIN-QA-007 | P1 | MFA exigido só no cliente (304) | Usuário com fator ativo, inclusive admin de plataforma e impersonação, acessa a API com token AAL1 | Login por senha → token AAL1 → PostgREST | `src/pages/Auth.tsx:150-160`; nenhum `aal` em SQL | Controle só na UI | Policy restritiva `aal2` para admins de plataforma e para quem tem fator; MFA obrigatório para admins | M | Token AAL1 de usuário com fator é negado na API | Segurança + Backend | CONFIRMADO PELO DIRETOR |
| CLIN-QA-008 | P1 | Papel global e convite que troca de clínica (202, 314) | Um admin da clínica A que aceita convite da B vira admin na B (papéis acumulados); impede papéis por unidade | Aceitar convite de B estando vinculado a A | `20260131002504…sql:43-50`; `20260727230000…sql:288-300` | `user_roles` sem `clinica_id`; `profiles.clinica_id` escalar | Curto prazo: recusar convite quando `clinica_id` já existe e é diferente. Médio prazo: `membros_unidade` + `tem_papel(clinica, papel)` em expand/contract (02 §1.3) | S + L | Aceite de convite de outra clínica retorna erro; pgTAP: admin da A não lê nem escreve nada da B | DBA + Arquiteto | 202 CONFIRMADO; corpo vigente de 314 SÓ RELATADO |
| CLIN-QA-009 | P1 | Webhook do WhatsApp frágil (207, 316, 217, 115) | IA síncrona estoura o tempo, o Evolution reenvia e o paciente recebe resposta duplicada; chave única para todos os tenants | Reenviar o mesmo evento sob latência | `whatsapp-webhook/index.ts:33-38,408,537` (SÓ RELATADO) | Processamento dentro do request | Enfileirar (tabela `jobs`) e responder em menos de 1 s; secret por instância com comparação em tempo constante; avaliar a Cloud API oficial | M | Reenvio do mesmo evento não gera segunda resposta; token de uma instância não aceita evento de outra | Backend | SÓ RELATADO |
| CLIN-QA-010 | P1 (comercial) | TISS XML inexistente (110, 208) | Bloqueia clínicas com convênio e laboratórios | Exportar um lote | `src/pages/FaturamentoConvenios.tsx:333-337` | Escopo não construído | Gerador em worker, validação contra o XSD da ANS por `versao_tiss`, hash do epílogo, XML guardado no storage (requer avaliação especializada) | L | XML do lote valida no XSD oficial da versão vigente e é aceito por uma operadora piloto | Backend + PO Faturamento | CONFIRMADO PELO DIRETOR |
| CLIN-QA-011 | P1 (comercial) | ICP-Brasil inexistente (111, 214) | Prescrição controlada, laudo e prontuário sem papel ficam bloqueados | — | `src/components/clinical/DigitalSignature.tsx:29-41` (SÓ RELATADO) | Não implementado | Provedor de assinatura em nuvem (PAdES/CAdES) via OAuth (requer avaliação especializada) | M/L | Documento assinado validado no Verificador ITI | Backend + PO Clínico | SÓ RELATADO |
| CLIN-QA-012 | P1 | Identificação do paciente nas telas de gravação (401, 402, 403) | Risco de prontuário ou pagamento no paciente errado; CPF exposto sem necessidade | Abrir a edição do prontuário; abrir "Confirmar Pagamento" na Recepção | `Prontuarios.tsx:2069-2080`; `Recepcao.tsx:1535` (SÓ RELATADO); `CaixaDiario.tsx:1611` (SÓ RELATADO) | Faixa criada como resumo, não como identificação | `PatientIdentityBar` obrigatório: nome completo ≥ 14 px, data de nascimento, idade, alergias e convênio; CPF mascarado com revelação auditada | M | Na edição do prontuário e nos diálogos de pagamento, nome, nascimento e alergias aparecem sem rolagem; CPF aparece como `***.***.***-12`; revelar gera auditoria. Reclassificar como P0 se o teste com usuários registrar seleção errada | Design + Front | 401 CONFIRMADO; 402/403 SÓ RELATADO |
| CLIN-QA-013 | P1 | Landing promete código de barras que não existe (105) | Promessa falsa ao laboratório; troca de amostra por leitura manual | Imprimir etiquetas no Mapa de Coleta | `LandingPage.tsx:209`; `MapaColeta.tsx:346-347` | Marketing à frente do produto | Imediato: corrigir o texto da landing. Depois: Code128 ou QR na etiqueta e leitura por leitor na coleta e na bancada | S + M | A landing não promete o que não existe; a etiqueta lida pelo leitor abre a amostra correta | Growth + PO Lab | CONFIRMADO PELO DIRETOR |
| CLIN-QA-014 | P1 [H] | Cache sem tenant e tipos desatualizados (206, 209) | Na impersonação ou na futura troca de unidade, a tela pode mostrar cache da clínica anterior | Impersonar a clínica A, depois a B, e abrir a Agenda | `src/hooks/useSupabaseData.ts:42,149`; 401 de 581 `queryKey` sem tenant; cerca de 275 `as any` (SÓ RELATADO) | Sem fábrica de chaves; `gen types` fora do CI | `src/data/queryKeys.ts` com tenant no primeiro segmento; `removeQueries` ao trocar; `gen types` no CI com gate de diff | M | Teste e2e: trocar de clínica não exibe nenhum dado anterior; diff de tipos zero | Frontend | SÓ RELATADO (hipótese) |

### D.4 P2 e P3

| ID | P | Título (origem) | Evidência | Proposta | Esf. | Teste de aceite | Dono | Verificação |
|---|---|---|---|---|---|---|---|---|
| CLIN-QA-015 | P2 (gate beta) | Observabilidade e runbooks ausentes (317, SRE 5–6) | `docs/operations` só com `SEED_TEMPLATES.md` | Sentry com scrubbing de PII, uptime externo, `postgres_exporter`; 6 runbooks (restauração, vazamento e comunicação à ANPD, VPS fora, disco cheio, rotação de chaves, rollback) | M | Alerta de uptime disparado em teste; 6 runbooks revisados | SRE | SÓ RELATADO |
| CLIN-QA-016 | P2 (comercial) | Sem analytics e UTM; trial de 3 dias com cartão (407, 408) | grep vazio por `gtag/posthog/utm_`; `LandingPage.tsx:197` | Eventos com consentimento; definição de ativação (4 passos + 1 check-in real em 7 dias); testar trial de 14 dias sem cartão | M | Funil signup → ativação visível com 7 dias de dados; coorte de conversão por 60 dias | Growth | `:197` CONFIRMADO |
| CLIN-QA-017 | P2 | Acessibilidade da Agenda (406) | `AgendaPage.tsx` sem atributos `aria-` | Teclado entre horários e `aria-live`; auditoria axe e NVDA | M | Agendamento completo só com teclado e NVDA | Front | SÓ RELATADO; rebaixado de P1 até o teste |
| CLIN-QA-018 | P2 | Mojibake, exclamações, emojis e atalhos prometidos inexistentes (405, 114) | `OnboardingWizard.tsx:45-46` (regressão local); mojibake em 11 arquivos no HEAD; `appointment-confirmation/index.ts:160` | Corrigir a codificação antes do commit; verificação de mojibake no CI; templates formais; remover ou implementar Alt+H/P/A | S | grep por `Ã§\|Ã£\|Ã©` em `src` = 0; nenhum emoji nos templates; cada atalho citado funciona | Front | CONFIRMADO PELO DIRETOR |
| CLIN-QA-019 | P2 | Tipografia e densidade (404) | 100 usos de `text-[10px]/[11px]`; 9 abas na ficha (`Pacientes.tsx:1701-1713`) | Corpo ≥ 14 px, rótulo ≥ 12 px, no máximo 5 abas visíveis | M | Nenhum texto < 12 px nas 5 telas diárias | Design | SÓ RELATADO |
| CLIN-QA-020 | P2 | `ai-medical-assistant` gera diagnóstico e prescrição via OpenAI, sem tela (107, 320) | `ai-medical-assistant/index.ts:56,158,209` (SÓ RELATADO); nenhuma chamada em `src` (confirmado) | Desativar a função ou documentar governança, DPA e base legal (requer avaliação especializada) | S | Função inacessível ou com consentimento e registro | PM + DPO | Parcial |
| CLIN-QA-021 | P2 | Verificador de interações com 11 pares e silêncio sem par (106) | `DrugInteractionChecker.tsx:61,180-181` | Mostrar o escopo da checagem; base licenciada (requer avaliação clínica especializada) | S/L | A tela informa a cobertura quando não encontra interação | PO Clínico | SÓ RELATADO |
| CLIN-QA-022 | P2 | O mesmo perfil valida e libera o laudo (108) | `20261011180000…sql:402` | Segregar funções e registrar o responsável técnico (RDC/ANVISA: requer avaliação especializada) | M | Quem validou não consegue liberar | PO Lab | SÓ RELATADO |
| CLIN-QA-023 | P3 | Texto da autorização de convênio promete resposta (109) | `AutorizacaoConvenioModal.tsx:293` vs `:116-118` | "Registre a resposta da operadora quando chegar" | S | Texto coerente com o fluxo | UX | SÓ RELATADO |
| CLIN-QA-024 | P2 (gate rede) | Multiunidade inexistente; policies sem padrão e sem initPlan (112, 205, 02 §1) | 0 `unidade_id`; 4 formas de policy; 0 `(select auth.uid())` | `organizacoes` + `membros_unidade`, helpers reescritas por dentro, policies normalizadas por lote com pgTAP; índices `clinica_id` | L | Usuário de rede vê o consolidado e o de unidade só a sua; `EXPLAIN` com InitPlan e p95 < 300 ms com 1M de linhas | Arquiteto + DBA | contagem de `unidade_id` CONFIRMADA |
| CLIN-QA-025 | P2 (gates) | Odontograma, NFS-e e Pix do paciente inexistentes (113, 215) | 0 ocorrências | Odontograma ligado ao orçamento; NFS-e por agregador; Pix com credencial da clínica | L | Fluxo orçamento → aprovação → recebimento → nota em homologação | PO por módulo | CONFIRMADO (ausência) |
| CLIN-QA-026 | P3 (gate lab/rede) | HL7/ASTM e SSO inexistentes (218) | só `fhir-export` | Agente on-premise para equipamentos; SAML por organização | L | Resultado simulado chega idempotente; login SAML com IdP de teste | Backend | SÓ RELATADO |
| CLIN-QA-027 | P2 | Replay no webhook do Mercado Pago; rate limit falha aberto e IP forjável (311, 312) | `mercadoPagoSignature.ts:58-63` (SÓ RELATADO); `rateLimit.ts:43-58` (CONFIRMADO) | Tolerância de `ts` de 5 min; IP só do proxy confiável; falhar fechado nos endpoints sensíveis | S | `ts` antigo devolve 401; header forjado não reinicia a cota | Backend + SRE | Parcial |
| CLIN-QA-028 | P2 | Ativação paga sem vínculo de e-mail (315) | `20261010198000…sql:193-195` | Comparar com `auth.email()` | S | E-mail divergente é negado | Backend | SÓ RELATADO |
| CLIN-QA-029 | P2 | Consentimento do agendamento público não gravado; INSERT aceita `clinica_id` nulo (320, nota do 03 §1) | `public-booking/index.ts:177`; `20260321012953…sql:223-232` | Gravar consentimento com versão do termo; confirmar se alguma migration posterior fecha `clinica_id IS NULL` | S | Registro a cada agendamento; INSERT com `clinica_id` nulo negado | Backend + DPO | SÓ RELATADO |
| CLIN-QA-030 | P2 | Fila genérica de jobs, DLQ e monitoramento do cron (213, 02 §5) | `process-notification-queue/index.ts:39-52` | Tabela `jobs` com `SKIP LOCKED`, estado `dead` e tela; alerta em `cron.job_run_details` | M | Job que falha N vezes vai para `dead` e aparece no painel | Backend | SÓ RELATADO |
| CLIN-QA-031 | P2 | Dívida de front: dados nas telas, telas gigantes, cores fixas, linha de base divergente (210, 211, 212, 409, 410, 415) | D.2 | Repositórios por domínio; quebra com testes de caracterização; tokens semânticos; script versionado de contagem; teto no CI que só pode cair | L | Contagens por script versionado; nenhum arquivo novo > 400 linhas; as 5 telas diárias < 1.200 linhas | Front + Design | contagens CONFIRMADAS com critério |
| CLIN-QA-032 | P3 | Slugs `auto-migrate`/`init-db`; tokens em texto puro; comparação não constante (216, 319, 217) | stubs 410; `public-guias-externas/index.ts:67-71` | Remover os slugs; gate funções publicadas × repositório; guardar hash | S | Lista publicada = pastas do repositório; token antigo recusado | DevOps + Backend | SÓ RELATADO |
| CLIN-QA-033 | P2 (comercial) | GTM: demo estática, contato só por `wa.me`, sem NPS, status page, health score, SEO, landing por segmento, preço validado, SLA (411–417, 420) | 04 §5–7 | Clínica demo sintética; formulário com UTM; NPS aos 30 dias; status page; health score em `PlatformCRM`; sitemap; preço por porte após Van Westendorp; SLA só após 60 dias de medição | M/L | Cada item com o aceite do 04 | Growth + CS | SÓ RELATADO |
| CLIN-QA-034 | P3 | Discovery de redes e odonto (418) | — | 5 entrevistas por segmento antes de construir | M | Relatório com decisão de construir ou não | Produto | — |
| CLIN-QA-035 | P3 | Atalhos nas telas operacionais (419) | — | Check-in, próximo paciente, salvar evolução, receber | S | Atalhos listados em `?` e funcionando | Front | — |
| CLIN-QA-036 | P3 | Helpers com `GRANT … anon` de maio (203, rebaixado) | `20260508172810…sql:1-13`, revogado em `20260728041952` | Coberto pelo 001; só confirmar na VPS | S | `has_function_privilege('anon','get_my_clinica_id()','execute') = false` | DBA | REBAIXADO |

### D.5 Mapa de deduplicação

| Consolidado | IDs de origem |
|---|---|
| 001 | 301, 302, 303, 313, 203 (resíduo em 036) |
| 002 | 101, 305, 204 (parte de CI), 202 (parte de teste) |
| 003 | 102, 306, 103, 310 |
| 004 | 307 |
| 005 | 308, 309 (PITR), SRE 1–3 |
| 006 | 104, 201, 204 (link Cloud), 309 (staging), 318, SRE 4 e 7 |
| 007 | 304 |
| 008 | 202, 314 |
| 009 | 207, 316, 217, 115 |
| 010 | 110, 208 |
| 011 | 111, 214 |
| 012 | 401, 402, 403 |
| 013 | 105 |
| 014 | 206, 209 |
| 015 | 317, SRE 5–6 |
| 016 | 407, 408 |
| 018 | 405, 114 |
| 020 | 107, 320 (transferência à OpenAI) |
| 024 | 112, 205, 02 §1 |
| 025 | 113, 215 |
| 026 | 218 |
| 027 | 311, 312 |
| 029 | 320 (consentimento), nota do 03 §1 |
| 031 | 210, 211, 212, 409, 410, 415 |
| 032 | 216, 217, 319 |
| 033 | 411, 412, 413, 414, 416, 417, 420 |
| demais | correspondência 1:1 (106→021, 108→022, 109→023, 315→028, 213→030, 418→034, 419→035, 404→019, 406→017) |

---

## E. Oportunidade frente aos concorrentes

**Baseline público.** Coletado pelas funções 01 e 04 em 27/10/2026 nos sites oficiais. SÓ RELATADO: não reabri as fontes. Não atribuo fraquezas a concorrentes além do que está publicado.

| Concorrente | Baseline publicado (fonte) | O que o EloLab não tem | Observação |
|---|---|---|---|
| Feegow | R$129/199/249 por profissional; guia TISS desde o Starter; SBIS NGS2 (2021) (feegowclinic.com.br/precos-e-planos/) | TISS, SBIS | O 04 não conseguiu abrir o site (TLS). Preço a reconfirmar |
| iClinic | R$99–299 por profissional; TISS a partir do Plus; ICP A1/A3; teste de 5 dias sem cartão (iclinic.com.br/precos/) | TISS, ICP, trial sem cartão | TISS como diferencial de plano |
| Doctoralia Pro | R$429–679/mês anual; marketplace e app do paciente (pro.doctoralia.com.br/preco) | Marketplace de pacientes | Não competir em aquisição de pacientes |
| ProDoctor | A partir de R$135/R$215; ICP em todos os planos; "Multilocal" como add-on (prodoctor.net/precos) | ICP, multilocal | — |
| Amplimed | Sob consulta; TISS, ICP, NFS-e, IA (amplimed.com.br/planos) | TISS, ICP, NFS-e | — |
| Clinicorp | R$159,90/R$369,90 por clínica; Pix e boleto; ranking de unidades (clinicorp.com/planos) | Pix do paciente, multiunidade | Também cobra por clínica |
| Simples Dental | R$149,90–349,90; ortodontia; plano Redes; trial de 7 dias sem cartão (simplesdental.com/planos-e-precos) | Odontograma, ortodontia | Referência para o gate de odonto |
| Shift, Matrix, Pleres (LIS) | Sob consulta; interfaceamento e CQ; venda consultiva | Interfaceamento, CQ, código de barras | Matrix: domínio não resolveu; vínculo Pleres/Pixeon NÃO VERIFICADO |

**Lacunas que impedem disputar o plano médio:** TISS XML, ICP-Brasil, NFS-e e Pix do paciente. Para os segmentos: multiunidade (redes), código de barras e interfaceamento (laboratório), odontograma (odonto).

**Diferenciais hipotéticos e como provar:**

| # | Hipótese (01 §5) | Métrica | Como provar com clínicas reais | Pré-requisito |
|---|---|---|---|---|
| H1 | Check-in com cobrança atômica reduz atendimentos "atendidos e não cobrados" | % de atendimentos sem lançamento em D+1 | 3 clínicas piloto, 30 dias antes e depois, dados agregados | P0 fechados |
| H2 | Clínica + laboratório no mesmo sistema elimina redigitação | Tempo pedido → laudo no prontuário; nº de digitações duplicadas | 2 clínicas com posto de coleta, cronometragem | 013 (código de barras) |
| H3 | TISS + glosa no plano de entrada acelera a conversão de clínicas com convênio | Conversão trial → pago nesse grupo | Oferta A/B na landing | 010 |
| H4 | Transparência (preço, confiabilidade e auditoria publicados) reduz a objeção de "parecer amador" | Demo → proposta; objeções no CRM | 10 entrevistas antes e depois da página de confiança | 005, 015, status page |
| H5 | Portal com confirmação reduz faltas | Taxa de no-show | Clínicas com e sem portal por 60 dias | 001, 003 |

Nenhum número de cliente, resultado ou depoimento do EloLab foi usado ou inventado. A prova social só pode vir de medição própria com autorização assinada (04 §6).

---

## F. Roadmap 7/30/60/90 dias e 6 meses

Fases: **estabilização** (7 e 30 dias) → **usabilidade** (60 dias) → **diferenciação** (90 dias) → **beta** (90 dias) → **comercialização** (6 meses). Toda alteração de banco ou produção exige autorização explícita do responsável e backup antes.

### F.1 Primeiros 7 dias: estabilização (contenção)

| # | Ação | ID | Dependência | Definição de pronto | Teste de aceite |
|---|---|---|---|---|---|
| 7.1 | Consulta só leitura na VPS: funções `prosecdef` executáveis por anon, `pg_policies` permissivas, `migration list` | 001, 006 | Autorização de acesso só leitura | Resultado anexado ao backlog; 001 sai de "suspeito" para confirmado ou derrubado | Lista de funções anexada e comparada com a allowlist |
| 7.2 | Migration de revogação de anon + `ALTER DEFAULT PRIVILEGES` + correção da checagem em `link_portal_paciente` e `platform_get_clinicas_saude` | 001 | 7.1; backup | Migration revisada e aplicada com aprovação | Chamada anon às duas RPCs retorna `42501` |
| 7.3 | Esconder a exclusão LGPD destrutiva | 004 | — | Botão indisponível; pedidos registrados para tratamento manual | Nenhum caminho da UI chama `deletePatientData` |
| 7.4 | Desligar o vínculo automático por telefone no WhatsApp e exigir nascimento no link público | 003 | — | Bot pede CPF + nascimento; link público cria pendência quando diverge | Casos (a) e (b) do 003 passam |
| 7.5 | Backup off-site criptografado e primeira restauração em VM descartável | 005 | Conta de storage externo | Dump diário fora da VPS; chave fora da VPS | Relatório de restauração com RTO medido |
| 7.6 | Corrigir a promessa de código de barras na landing e a regressão de mojibake antes de commitar | 013, 018 | — | Texto da landing fiel ao produto; worktree sem mojibake novo | grep de mojibake não aumenta em relação ao HEAD |

### F.2 Até 30 dias: estabilização (prova)

| # | Ação | ID | Dependência | Definição de pronto | Teste de aceite |
|---|---|---|---|---|---|
| 30.1 | CI com `supabase start`, seed de 2 clínicas e 5 perfis, suítes de isolamento, RLS e RBAC sem skip | 002 | — | Job obrigatório para merge | PR que remove uma policy quebra o CI |
| 30.2 | Diff de schema, baseline e deploy de banco por pipeline com aprovação; staging com dados sintéticos | 006 | 7.1 | Diff vazio e versões únicas | `migration list` sem divergência |
| 30.3 | MFA `aal2` para admins de plataforma e usuários com fator | 007 | 30.2 | Policy restritiva aplicada | Token AAL1 negado |
| 30.4 | Convite recusa usuário de outra clínica | 008 | — | RPC alterada | Aceite cruzado retorna erro |
| 30.5 | RPC transacional de anonimização LGPD | 004 | Parecer do DPO (requer avaliação jurídica) | Prontuário preservado | Falha simulada não deixa estado parcial |
| 30.6 | Webhook do WhatsApp assíncrono, secret por instância, sem `especialidade` no retorno | 009, 003 | — | Resposta < 1 s | Reenvio não duplica |
| 30.7 | Observabilidade mínima e 6 runbooks | 015 | — | Alertas ativos | Alerta disparado em teste |
| 30.8 | Desativar `ai-medical-assistant` até haver governança | 020 | — | Função inacessível | Chamada retorna 404/410 |
| 30.9 | Smoke das 13 jornadas em staging com dados sintéticos | C | 30.2 | Roteiro versionado | Cada jornada da seção C marcada PASSOU ou FALHOU com evidência |

**Gate de saída da estabilização:** zero P0 aberto; 30.1 verde; 30.9 sem FALHOU em jornada crítica.

### F.3 Até 60 dias: usabilidade

| # | Ação | ID | Dependência | Definição de pronto | Teste de aceite |
|---|---|---|---|---|---|
| 60.1 | `PatientIdentityBar` em toda tela que grava dado clínico ou financeiro; CPF mascarado | 012 | — | Componente em prontuário, recepção e caixa | Aceite do 012 |
| 60.2 | Teste moderado: 5 participantes × 4 perfis × 5 tarefas, em staging | 012, 017, 019 | 30.2 | Relatório com sucesso, tempo, erros, SEQ e SUS | Sucesso > 80% e SUS > 70, ou backlog derivado |
| 60.3 | Tipografia mínima, abas excedentes em menu, Agenda acessível por teclado | 017, 019 | 60.2 | Aplicado nas 5 telas diárias | Aceites do 017 e do 019 |
| 60.4 | Fábrica `qk` com tenant e `gen types` no CI | 014 | — | Domínios agenda e fila migrados | Troca de clínica sem dado anterior |
| 60.5 | Script versionado de contagem e teto no CI (cores, `.from`, linhas) | 031 | — | Linha de base única publicada | CI falha se alguma contagem subir |
| 60.6 | Eventos de funil com consentimento; definição de ativação | 016 | — | Painel com 7 dias de dados | Funil visível |

### F.4 Até 90 dias: diferenciação e beta

| # | Ação | ID | Dependência | Definição de pronto | Teste de aceite |
|---|---|---|---|---|---|
| 90.1 | TISS XML validado pelo XSD da versão vigente (requer avaliação especializada) | 010 | Worker de jobs (030) | XML gerado e validado | Aceito em uma operadora piloto |
| 90.2 | Integração ICP-Brasil por provedor em nuvem (requer avaliação especializada) | 011 | — | Assinatura PAdES de prontuário e receita | Verificador ITI válido |
| 90.3 | PITR e restauração mensal rotineira | 005 | 7.5 | WAL contínuo | Restauração em timestamp escolhido |
| 90.4 | **Beta fechado** com 3–5 pequenas clínicas, medindo H1 e H5 | E | Gate de estabilização + 60.1 | Contrato de beta e DPA assinados | Relatório de 30 dias com as métricas H1/H5 |
| 90.5 | Status page e NPS aos 30 dias | 033 | 015 | Página pública com 3 componentes | NPS coletado |
| 90.6 | Clínica demo sintética com reinício diário | 033 | — | Link de demo | Visitante navega agenda, prontuário e caixa |

### F.5 Até 6 meses: comercialização e gates de segmento

| # | Ação | ID | Dependência | Definição de pronto | Teste de aceite |
|---|---|---|---|---|---|
| 6m.1 | Preço por porte e add-ons após pesquisa com 20+ clínicas; decisão sobre trial | 016, 033 | 90.4 | Tabela aprovada pelo responsável | Coorte de 60 dias medida |
| 6m.2 | Landings `/clinicas` e `/laboratorios`; `/redes` só com formulário | 033 | Gates abaixo | Páginas publicadas sem promessas não entregues | Revisão produto × landing sem divergência |
| 6m.3 | SLA publicado só após 60 dias de medição | 033 | 015, 90.5 | Números medidos | Página de SLA com histórico |
| 6m.4 | Multiunidade (expand/contract) e papéis por unidade | 024, 008 | 30.1, 30.2 | `membros_unidade` em produção; policies normalizadas | pgTAP de unidade A × B verde |
| 6m.5 | Código de barras na etiqueta e leitura por leitor; segregação valida/libera | 013, 022 | — | Code128/QR impresso e lido | Leitor abre a amostra certa; quem valida não libera |
| 6m.6 | Interfaceamento HL7/ASTM com um equipamento piloto | 026 | 030 | Agente on-premise | Resultado simulado chega idempotente |
| 6m.7 | Odontograma ligado ao orçamento | 025 | Discovery 034 | Módulo em staging | Fluxo dente → orçamento → aprovação → recebimento |
| 6m.8 | NFS-e e Pix do paciente | 025 | 030 | Integrados por agregador | Nota emitida e cancelada em homologação |
| 6m.9 | Avaliação SBIS/CFM e LGPD (requer avaliação especializada) | — | 011, 004 | Parecer contratado | Relatório do avaliador |

### F.6 Gates por segmento

| Segmento | Ordem | Gate de entrada (todos obrigatórios) | Prova exigida |
|---|---|---|---|
| Clínicas pequenas e médias | 1º | Zero P0; 30.1 verde; 30.9 sem falha crítica; 60.1 entregue; backup off-site com restauração medida | Beta de 90.4 com relatório de 30 dias |
| Redes multiunidade | 2º | Gate anterior + multiunidade (6m.4) + papéis por unidade (008) + TISS (90.1) + ICP (90.2); SSO conforme demanda | pgTAP A × B; XML aceito em operadora; assinatura validada no ITI; uma rede piloto com 2+ unidades |
| Laboratórios | 3º | Gate de clínicas + código de barras (6m.5) + interfaceamento (6m.6); segregação valida/libera; avaliação RDC (requer avaliação especializada) | Etiqueta lida em bancada; resultado de equipamento piloto sem redigitação |
| Odonto e especialidades | 4º | Gate de clínicas + odontograma (6m.7); plano de tratamento ligado ao financeiro | Fluxo completo em uma clínica odonto piloto |

---

## G. Veredito de lançamento

**NO-GO** para escala comercial e para os segmentos rede, laboratório e odonto.
**GO CONDICIONAL** para um beta fechado com 3–5 pequenas clínicas, depois do gate de estabilização (F.2).

**Justificativa.** Há cinco P0. Pela rubrica, qualquer P0 impõe NO-GO. Dois deles (001 e 003) são falhas confirmadas no código com correção pequena; os outros três (002, 004, 005) são ausência de prova ou de proteção para riscos irreversíveis. As clínicas que já usam o produto devem receber as contenções de 7 dias (7.2 a 7.5) independentemente do veredito.

**Condições para o GO CONDICIONAL:**

1. 001 a 005 fechados com o teste de aceite executado e registrado.
2. Suítes de isolamento, RLS e RBAC executando no CI sem skip.
3. Smoke das jornadas em staging sem falha em marcar, recepcionar, atender, registrar prontuário e cobrar.
4. Contrato de beta com DPA, sem promessa de TISS, ICP ou código de barras.

**Confiança da evidência:** média. É análise estática com 16 evidências reabertas pelo diretor. Nada foi executado contra banco ou produção, e a única execução relatada (`tsc` e `vitest`, 03 §4) não cobre RLS nem grants.

**Risco residual após o GO CONDICIONAL:** VPS única (sem réplica); WhatsApp via Evolution (risco de bloqueio do número); verificador de interações limitado; usabilidade não validada em escala; telas grandes que tornam caras as mudanças.

**Itens que exigem validação especializada (jurídica, clínica ou humana):**

| Item | Tipo |
|---|---|
| Exclusão × anonimização × guarda de 20 anos do prontuário (004) | Jurídica (LGPD, Lei 13.787/2018, CFM) |
| Transferência de dados de pacientes à OpenAI (WhatsApp e `ai-medical-assistant`), DPA e base legal (020, 009) | Jurídica (LGPD) |
| Conduta clínica gerada por IA (020) | Clínica |
| Cobertura e fonte do verificador de interações (021) | Clínica (farmacêutico ou médico) |
| Segregação valida/libera e responsável técnico no laboratório (022) | Regulatória (RDC/ANVISA) |
| TISS XML e versão vigente da ANS (010) | Regulatória (ANS) |
| ICP-Brasil e validade jurídica da assinatura (011) | Jurídica e de certificação |
| SBIS/CFM, ISO 27001 | Certificação |
| Paciente compartilhado entre unidades de uma rede (024) | Jurídica (LGPD) |
| Retenção do prontuário após cancelamento da assinatura | Jurídica |
| Identificação do paciente na tela (012) | Teste com usuários reais |

---

## H. Ações não realizadas

| Ação | Motivo |
|---|---|
| Qualquer consulta ao banco da VPS (grants, policies, `migration list`, drift) | Sem autorização nem acesso nesta tarefa. 001 permanece "suspeito" até 7.1 |
| Execução da aplicação, Playwright, E2E, pgTAP, `EXPLAIN` | Exigem Supabase local ou staging; nada foi iniciado |
| Reexecução de `tsc` e `vitest` | Resultado aceito como relatado pelo 03 (comando + exit 0); não repetido |
| Inspeção visual, medição de cliques e teste com usuários | Sem navegador; toda conclusão de UX é hipótese |
| Leitura completa do corpo vigente de `accept_employee_invitation` (314), de `patient-portal` (310), de `DigitalSignature.tsx` e `DrugInteractionChecker.tsx` | Fora da amostra; marcados SÓ RELATADO |
| Configuração de Kong/Traefik (headers de IP), backups do Easypanel, versões do GoTrue e do edge-runtime | Sem acesso à VPS |
| Reverificação das fontes públicas de concorrentes | Fora do escopo desta consolidação; dados datados de 27/10/2026 pelas funções 01 e 04 |
| `expo-mobile`, branch `origin/feat/mobile-web`, 45 edge functions não amostradas | Fora do escopo dos relatórios e da amostra |
| Avaliações jurídica, clínica, regulatória e de certificação | Requerem avaliação especializada |
| Alterações de código, migrations, deploy, SSH ou commit | Proibidos pela tarefa; o único arquivo escrito é este |
