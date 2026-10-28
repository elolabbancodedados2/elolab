# Backlog de produto do EloLab

Dono: `product-owner`. Atualizado em 27/10/2026, depois das rodadas 1 e 2.
Fonte: P0 e P1 consolidados em `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md`, seção D.3 (CLIN-QA-001 a 014), com a ordem do roadmap da seção F, mais os itens novos abertos pelos agentes nas rodadas 1 e 2.

## Como ler
- Cada item consolidado do diagnóstico (001 a 014) virou um **épico**, quebrado em histórias pequenas que podem ser testadas sozinhas.
- Faixas de ID da rodada 2 (consolidado da rodada 1, seção 4, item 1): PO 501 a 549, UX 551 a 559, QA 561 a 569, segurança 571 a 579, SRE 581 a 589 e demais agentes 591 a 599.
- Cada arquivo traz gravidade, impacto, perfil, evidência (`caminho:linha`), proposta, esforço, critérios Dado/Quando/Então (caminho principal, erro, permissão negada e outra clínica), definição de pronto, dependências e dono sugerido. As histórias da rodada 1 ganharam a seção **"Situação após as rodadas 1 e 2"**, com o que existe, o que falta e a validação do PO.

### Status usados nesta revisão

| Status | Significado | Estado em `docs/time/GATES.md` 1.1 |
|---|---|---|
| **Aberto** | Nada escrito, ou só proposta | `aberto` |
| **Aberto (parcial)** | Parte dos critérios tem trabalho local; o restante não | `aberto` |
| **Feito localmente** | Código ou documento no worktree, com teste local quando indicado. Ainda há trabalho do time ou falta publicar | `correção escrita` ou `testado localmente` |
| **Aguardando aplicação** | Feito localmente e testado; o próximo passo é a aplicação ou publicação autorizada pelo responsável | `testado localmente` |
| **Bloqueado por decisão do responsável** | Não anda sem decisão, autorização ou parecer especializado | qualquer um |
| **Aceita** / **Recusada** | O PO conferiu cada critério com evidência | `fechado` exige E4 |

**Nenhuma história está Aceita.** Nada foi aplicado em banco, publicado ou commitado nas rodadas 1 e 2. Nenhum P0 passou de `testado localmente`.

## Resumo da situação (27/10/2026)

| Status | Quantidade | Histórias |
|---|---|---|
| Aguardando aplicação | 2 | 502, 503 |
| Feito localmente | 8 | 504, 505, 506, 508, 510, 524, 525 (Recepção), 555 |
| Bloqueado por decisão do responsável | 9 | 501, 507, 509, 513, 516, 529, 531, 538, 540 |
| Aberto (parcial) | 3 | 511, 517, 526 |
| Aberto | 19 | 512, 514, 515, 518 a 523, 527, 528, 530, 532 a 537, 539 |

P0 abertos ou suspeitos, que mantêm o NO-GO: **512** (confirmado na rodada 2), **555** (suspeito até o teste de tela) e os épicos 001 a 005, nenhum além de `testado localmente`.

## Fila ordenada

Regra de ordem: P0 antes de tudo; dentro da mesma gravidade, primeiro o que o time executa sem decisão do responsável, depois a fase do roadmap (7 dias → 30 → 60 → 90 → 6 meses); dentro da fase, o que desbloqueia outras histórias.

### P0: contenção, executável pelo time agora

| # | ID | História | Épico | Esf. | Dono sugerido | Depende de | Status |
|---|---|---|---|---|---|---|---|
| 1 | [CLIN-QA-512](CLIN-QA-512-portal-dependente-vinculo-confirmado.md) | Portal mostra dependente só com vínculo confirmado (CA0: contenção imediata) | 003 | S (CA0) / M | backend-developer | CA0: nenhuma; vínculo: parecer do DPO | Aberto. P0 confirmado; a mitigação local não fecha a cadeia (571) |
| 2 | [CLIN-QA-555](CLIN-QA-555-prontuario-grava-no-paciente-exibido.md) | Prontuário grava sempre no paciente exibido | 012 | S | qa-engineer (teste de tela) | — | Feito localmente; P0 suspeito até o teste U2 |

### P0: estabilização, contenção em até 7 dias (F.1)

| # | ID | História | Épico | Esf. | Dono sugerido | Depende de | Status |
|---|---|---|---|---|---|---|---|
| 3 | [CLIN-QA-501](CLIN-QA-501-inventario-funcoes-anon-vps.md) | Inventário somente leitura das funções executáveis por anon na VPS | 001 | S | responsável + security-engineer | autorização de leitura | Bloqueado por decisão do responsável (C1) |
| 4 | [CLIN-QA-502](CLIN-QA-502-revogar-anon-privilegios-padrao.md) | Revogar EXECUTE de anon e PUBLIC, com privilégios padrão e allowlist | 001 | S | database-engineer | 501, revisão da segurança, backup | Aguardando aplicação (PGlite 63/63) |
| 5 | [CLIN-QA-503](CLIN-QA-503-rpcs-portal-e-saude-exigem-identidade.md) | `link_portal_paciente` e `platform_get_clinicas_saude` exigem identidade | 001 | S | database-engineer | junto com 502 | Aguardando aplicação |
| 6 | [CLIN-QA-504](CLIN-QA-504-agendamento-publico-cpf-e-nascimento.md) | Agendamento público só vincula com CPF e nascimento | 003 | S | backend + frontend | 571 (CA-R2) | Feito localmente |
| 7 | [CLIN-QA-505](CLIN-QA-505-whatsapp-sem-vinculo-por-telefone.md) | WhatsApp não vincula pelo telefone e exige CPF e nascimento | 003 | M | backend-developer | 576 | Feito localmente |
| 8 | [CLIN-QA-506](CLIN-QA-506-whatsapp-consulta-sem-dados-sensiveis.md) | Consulta no WhatsApp devolve só data, hora e status | 003 | S | backend-developer | 505 | Feito localmente |
| 9 | [CLIN-QA-507](CLIN-QA-507-whatsapp-conversas-com-vinculo-antigo.md) | Conversas abertas com vínculo antigo por telefone | 003 | S | responsável (C5) + database-engineer | 505, 509 | Bloqueado por decisão do responsável |
| 10 | [CLIN-QA-508](CLIN-QA-508-bloquear-exclusao-lgpd-destrutiva.md) | Bloquear a exclusão LGPD destrutiva e registrar o pedido | 004 | S | tech-lead | publicação | Feito localmente |
| 11 | [CLIN-QA-509](CLIN-QA-509-backup-offsite-e-restauracao.md) | Backup off-site criptografado e primeira restauração cronometrada | 005 | M | devops-sre | D1 a D4 | Bloqueado por decisão do responsável |

### P0: estabilização, prova em até 30 dias (F.2)

| # | ID | História | Épico | Esf. | Dono sugerido | Depende de | Status |
|---|---|---|---|---|---|---|---|
| 12 | [CLIN-QA-510](CLIN-QA-510-ci-banco-efemero-sem-skip.md) | CI roda isolamento, RLS e RBAC contra banco efêmero, sem skip | 002 | M | devops-sre + qa-engineer | 563, 564, 567, autorização de PR | Feito localmente (nunca rodou no Actions) |
| 13 | [CLIN-QA-511](CLIN-QA-511-suite-isolamento-ampliada.md) | Suíte de isolamento cobre `clinica_id` nulo, RPC, Storage, Realtime e escrita | 002 | M | qa-engineer | 510 | Aberto (parcial) |
| 14 | [CLIN-QA-513](CLIN-QA-513-anonimizacao-lgpd-transacional.md) | Anonimização LGPD transacional que preserva o prontuário | 004 | M | backend + database | parecer do DPO, 578, 579 | Bloqueado por decisão do responsável (trava desligada) |
| 15 | [CLIN-QA-514](CLIN-QA-514-pitr-e-restauracao-mensal.md) | PITR e restauração mensal de rotina | 005 | M | devops-sre | 509 | Aberto |

### P1: em até 7 dias (F.1)

| # | ID | História | Épico | Esf. | Dono sugerido | Depende de | Status |
|---|---|---|---|---|---|---|---|
| 16 | [CLIN-QA-515](CLIN-QA-515-landing-sem-promessa-codigo-de-barras.md) | Landing não promete código de barras nem ICP-Brasil sem base | 013 | S | growth-marketing + frontend | — | Aberto (`LandingPage.tsx:209` ainda promete) |

### P1: em até 30 dias (F.2)

| # | ID | História | Épico | Esf. | Dono sugerido | Depende de | Status |
|---|---|---|---|---|---|---|---|
| 17 | [CLIN-QA-516](CLIN-QA-516-diff-schema-e-versao-duplicada.md) | Diff de schema produção × repositório e versão duplicada | 006 | M | database-engineer + responsável | leitura da VPS | Bloqueado por decisão do responsável |
| 18 | [CLIN-QA-518](CLIN-QA-518-staging-com-dados-sinteticos.md) | Staging com dados sintéticos | 006 | M | devops-sre | 516 | Aberto |
| 19 | [CLIN-QA-517](CLIN-QA-517-pipeline-deploy-banco-com-aprovacao.md) | Deploy de banco por pipeline com aprovação; CI sem projeto Cloud | 006 | M | devops-sre + tech-lead | 516, 518 | Aberto (parcial) |
| 20 | [CLIN-QA-519](CLIN-QA-519-convite-recusa-usuario-de-outra-clinica.md) | Convite recusa usuário de outra clínica | 008 | S | database-engineer | — | Aberto |
| 21 | [CLIN-QA-520](CLIN-QA-520-mfa-aal2-admins-plataforma.md) | API exige AAL2 de admins de plataforma e na impersonação | 007 | M | security + database | — | Aberto |
| 22 | [CLIN-QA-521](CLIN-QA-521-mfa-aal2-usuarios-com-fator.md) | API exige AAL2 de quem tem fator cadastrado | 007 | M | database + security | 520 | Aberto |
| 23 | [CLIN-QA-536](CLIN-QA-536-whatsapp-vinculo-manual-pela-equipe.md) | A equipe vincula e desvincula a conversa do WhatsApp | 003 | M | frontend + backend | 505, C5 | Aberto (nova) |
| 24 | [CLIN-QA-537](CLIN-QA-537-link-publico-sem-duplicata-silenciosa.md) | Link público não cria cadastro duplicado em silêncio | 003 | S | backend + frontend | 504, 512 | Aberto (nova) |
| 25 | [CLIN-QA-538](CLIN-QA-538-pedidos-do-titular-em-registro-unico.md) | Pedidos do titular LGPD num registro único, restrito e com prazo | 004 | M | database + backend + frontend | parecer do DPO | Bloqueado por decisão do responsável (nova) |
| 26 | [CLIN-QA-535](CLIN-QA-535-convenio-sem-receita-em-dobro.md) | Atendimento de convênio não vira dívida do paciente nem receita em dobro | 010 | M | qa-engineer, depois database | 518 (reprodução) | Aberto (nova, hipótese) |
| 27 | [CLIN-QA-540](CLIN-QA-540-limites-dos-planos-conferidos.md) | Limites de usuários dos planos à venda conferidos e informados | — | S | database + growth | leitura da VPS, decisão de preço | Bloqueado por decisão do responsável (nova, hipótese) |
| 28 | [CLIN-QA-522](CLIN-QA-522-webhook-whatsapp-assincrono-idempotente.md) | Webhook do WhatsApp assíncrono e sem resposta duplicada | 009 | M | backend-developer | ADR 0003, 505 | Aberto |
| 29 | [CLIN-QA-523](CLIN-QA-523-webhook-whatsapp-segredo-por-instancia.md) | Segredo por instância no webhook do WhatsApp | 009 | S | backend-developer | — | Aberto |

### P1: usabilidade, até 60 dias (F.3)

| # | ID | História | Épico | Esf. | Dono sugerido | Depende de | Status |
|---|---|---|---|---|---|---|---|
| 30 | [CLIN-QA-524](CLIN-QA-524-identificacao-paciente-no-prontuario.md) | Identificação completa do paciente no prontuário | 012 | S | frontend + designer | 555 | Feito localmente |
| 31 | [CLIN-QA-525](CLIN-QA-525-identificacao-paciente-nos-pagamentos.md) | Identificação do paciente nos diálogos de pagamento | 012 | S | frontend + designer | 524 | Feito localmente (Recepção); caixa aberto |
| 32 | [CLIN-QA-526](CLIN-QA-526-cpf-mascarado-revelacao-auditada.md) | CPF mascarado com revelação auditada | 012 | M | frontend + backend | 524 | Aberto (parcial) |
| 33 | [CLIN-QA-527](CLIN-QA-527-cache-com-tenant-e-limpeza-na-troca.md) | Cache com tenant e prova de que a troca de clínica não vaza | 014 | M | frontend + qa | 510 | Aberto |
| 34 | [CLIN-QA-528](CLIN-QA-528-tipos-gerados-no-ci.md) | Tipos do banco gerados no CI com gate de diff | 014 | S | devops-sre + frontend | 510 | Aberto |

### P1: diferenciação, até 90 dias (F.4), e gates de segmento (F.5)

| # | ID | História | Épico | Esf. | Dono sugerido | Depende de | Status |
|---|---|---|---|---|---|---|---|
| 35 | [CLIN-QA-529](CLIN-QA-529-tiss-especificacao-regulatoria.md) | TISS: versão vigente e escopo do primeiro lote | 010 | S | especialista + business-analyst | avaliação ANS | Bloqueado por decisão do responsável |
| 36 | [CLIN-QA-530](CLIN-QA-530-tiss-xml-lote-validado.md) | TISS: XML do lote validado no XSD | 010 | L | backend-developer | 529, 594, fila de jobs | Aberto |
| 37 | [CLIN-QA-531](CLIN-QA-531-icp-brasil-escolha-de-provedor.md) | ICP-Brasil: escolha do provedor em nuvem | 011 | S | architect + especialista | avaliação especializada | Bloqueado por decisão do responsável |
| 38 | [CLIN-QA-532](CLIN-QA-532-icp-brasil-assinatura-pades.md) | ICP-Brasil: assinatura PAdES de prontuário e receita | 011 | L | backend + frontend | 531 | Aberto |
| 39 | [CLIN-QA-533](CLIN-QA-533-codigo-de-barras-na-etiqueta.md) | Código de barras na etiqueta e leitura na bancada | 013 | M | frontend | 515 | Aberto |
| 40 | [CLIN-QA-534](CLIN-QA-534-papeis-por-clinica.md) | Papéis por clínica no lugar do papel global | 008 | L | architect + database | ADR 0001, 510, 511, 517, 519 | Aberto |

### P2

| # | ID | História | Épico | Esf. | Dono sugerido | Depende de | Status |
|---|---|---|---|---|---|---|---|
| 41 | [CLIN-QA-539](CLIN-QA-539-consentimento-do-portal-registrado.md) | O consentimento dado no portal fica registrado | 004 | S | backend + database | — | Aberto (nova) |

## Itens novos abertos pelos agentes (rodadas 1 e 2)

Itens com ID próprio de outro agente ficam registrados aqui e apontam para a história que os cobre. "Sem história" quer dizer que o item ainda será quebrado pelo PO; o achado e a evidência estão no documento de origem.

### UX (faixa 551 a 559; antigos 541 a 548, `docs/ux/pesquisa/plano-rodada-1.md:355-362`)

| ID | Gravidade | Título | Coberto por | Situação |
|---|---|---|---|---|
| 551 (541) | P1 | "Confirmar Pagamento" sem identificação do paciente | 525 | Feito localmente na Recepção |
| 552 (542) | P1 (P0 se o teste R1 falhar) | Check-in de um clique numa lista que se move | Sem história | Aberto. Requer decisão de UX (congelar a lista ou desfazer) |
| 553 (543) | P1 | Card da Recepção sem segundo identificador | Sem história | Aberto |
| 554 (544) | P1 | Faixa do prontuário em edição sem nascimento nem alergias | 524 | Feito localmente |
| 555 (545) | **P0 suspeito** | Prontuário mostra um paciente e grava outro | [555](CLIN-QA-555-prontuario-grava-no-paciente-exibido.md) | Feito localmente; falta teste de tela |
| 556 (546) | P1 **[AE]** | Nome social e civil inconsistentes entre telas | Sem história | Aberto; política de nome social com o DPO |
| 557 (547) | P1 (P0 se F2 falhar) | Venda de exame no caixa com nome e CPF de 10 px | 525 (fase do caixa) | Aberto |
| 558 (548) | P2 | Lista do caixa sem paciente; recibo com paciente oculto | 525 (fase do caixa) | Aberto |

### QA (faixa 561 a 569)

| ID | Gravidade | Título | Coberto por | Situação |
|---|---|---|---|---|
| 561 | P3 | Mensagens do `identificar_paciente` revelam que o CPF existe | 505 (é o mesmo achado do 576) | Aberto |
| 562 | P3 | `book` responde diferente com nascimento certo ou errado | 504 (é o mesmo achado do 573) | Aberto |
| 563 | P1 | Versão de migration `20261010198000` duplicada | 516, 510 | Bloqueado: leitura da VPS. Tratamento documentado em `docs/arquitetura/banco/versoes-duplicadas.md` |
| 564 | P1 | Modo de teste do Vite fixa a chave sintética (`vite.config.ts:152`) | 510 | Aberto (tech-lead). Conferido pelo PO em 27/10: ainda `createViteTestSupabaseDefine({})` |
| 565 | P1 | Asserções de isolamento passam com banco vazio | 510, 511 | Feito localmente (QA, rodada 2); nunca executado contra banco |
| 566 | P2 | Sem seed de duas clínicas | 510 | Feito localmente (`tests/fixtures/seed-duas-clinicas.ts`) |
| 567 | P2 | Job `e2e-tests` passa a falhar nas 3 specs de segurança | 510 | Feito localmente pelo devops-sre (lista explícita de specs); falta confirmar no Actions |
| 568 | P3 | Casos de CPF duplicado não podem ser semeados (índice único) | 505, 537 | **Decisão do PO:** os ramos `cpf_duplicado` ficam cobertos por teste de unidade com dado legado simulado, sem seed; não bloqueiam a 510 |

### Segurança (faixa 571 a 579, `docs/seguranca/auditoria-rodada-2.md`)

| ID | Gravidade | Título | Coberto por | Situação |
|---|---|---|---|---|
| 571 | **P0** | Link público cria titular com CPF de terceiro e contatos próprios (cadeia do 512) | 512 (CA7), 504 (CA-R2) | Aberto |
| 572 | P2 | Oráculo pela agenda no link público | 504 | Aberto |
| 573 | P2 | 409 de "2 pedidos pendentes" confirma CPF e nascimento | 504 | Aberto |
| 574 | P2 | Cópias de dado pessoal em tarefa e em `agendamentos.observacoes` | 538, 513 (CA11) | Aberto |
| 575 | P3 | Aceite LGPD do link público sem registro | 539 (relacionado) | Aberto |
| 576 | P3 | Oráculo de existência do CPF no WhatsApp | 505 | Aberto |
| 577 | P2 | CPF mais nascimento é conhecimento, não posse | 505 | Aberto. Regra de produto: nenhuma ferramenta nova do bot com dado clínico sem confirmação por posse |
| 578 | P2 | Cópias de dado pessoal que a anonimização não alcança | 513 (CA11) | Aberto |
| 579 | P2 | Anonimização irreversível sem `aal2` | 513 (CA9) | Aberto |
| SEC-R1-06 | P2 | Hash guardado do token do portal aceito como token | — | Feito localmente (`patient-portal/acessoPortal.ts`, 38 testes Deno do backend). Falta a consulta 6.1 na VPS antes de publicar |

### Tech-lead (revisão da rodada 2, `docs/time/rodada-2/tech-lead.md`, seção 2)

| ID | Gravidade | Título | Coberto por | Situação |
|---|---|---|---|---|
| TL-R2-01 | **P0** | 512 continua aberto; dependentes não existem no `HEAD` | 512 (CA0) | Aberto |
| TL-R2-02 | P2 | `update_contact` apaga o e-mail quando só o telefone é enviado | 512 (CA0 restringe ao titular) | Aberto |
| TL-R2-03 | P2 | `cpf_responsavel` só casa dois formatos | 512 (o vínculo explícito substitui) | Aberto |
| TL-R2-05 | P1 | Não tornar o `security-e2e` obrigatório antes de resolver o 563 | 510 | Registrado no critério da 510 |
| TL-R2-06 | P1 | É o 564 | 510 | Aberto |
| TL-R2-07 | P2 | Contrato do seed com as 18 `QA_*` não confirmado | 510 | Aberto (qa-engineer, devops-sre) |
| TL-R2-08 a 10 | P2 e P3 | Ressalvas na migration da 502 | 502 | Abertos; não bloqueiam a aplicação |
| TL-R2-11 | P3 | Parâmetro `habilitada` contorna a trava da anonimização | 513 | Aberto |

### Especialista de domínio: conflito de faixa

O `especialista-dominio-saude` numerou seus achados como 501 a 509 em `docs/produto/dominio/requisitos-regulatorios.md`, dentro da faixa do PO, onde esses IDs já são histórias. Pela regra de faixas, os achados dele passam a **591 a 599**, na mesma ordem. O documento de origem não foi editado pelo PO; o dono deve renumerar.

| ID novo | Antigo | Gravidade | Título | Coberto por | Situação |
|---|---|---|---|---|---|
| 591 | 501 | P1 regulatório **[AE]** | Receita sai sempre "simples", sem aviso para controle especial ou antimicrobiano; a exigência do SNCR começa por volta de 30/10/2026 (data diverge entre fontes) | Sem história. **Prioridade de decisão:** prazo iminente | Aberto |
| 592 | 502 | P2 **[AE]** | Telas chamam gov.br de ICP-Brasil | 531 (contexto); correção de texto S, sem história | Aberto |
| 593 | 503 | P2 | Lista de versões TISS desatualizada | 529 | Aberto |
| 594 | 504 | P1 comercial | Não existe guia de faturamento; o lote recebe quantidade digitada | 530 (pré-requisito) | Aberto |
| 595 | 505 | P1 **[AE]** | Retificação de laudo liberado sem nova conferência; enfermagem como responsável técnico | Sem história | Aberto |
| 596 | 506 | P2 | Valor crítico sem registro de comunicação | Sem história | Aberto |
| 597 | 507 | P2 | CQ desligado da liberação | Sem história | Aberto |
| 598 | 508 | P2 | Etiqueta sem número de registro do paciente | 533 | Aberto |
| 599 | 509 | P3 | "CRM" fixo nos documentos, embora o cadastro aceite CRO | Sem história | Aberto |

### Business-analyst e growth-marketing (rodada 1, sem ID próprio)

| Lacuna | Gravidade | História criada |
|---|---|---|
| L-FC-01 receita em dobro no convênio | P1 (hipótese) | [535](CLIN-QA-535-convenio-sem-receita-em-dobro.md) |
| L-ID-02 sem tela para vincular conversa | P1 | [536](CLIN-QA-536-whatsapp-vinculo-manual-pela-equipe.md) |
| L-ID-03 duplicata silenciosa sem CPF | P1 | [537](CLIN-QA-537-link-publico-sem-duplicata-silenciosa.md) |
| L-LG-02 e L-LG-05 pedidos do titular fora do registro LGPD | P1 **[AE]** | [538](CLIN-QA-538-pedidos-do-titular-em-registro-unico.md) |
| L-LG-08 consentimento do portal viola o CHECK | P2 | [539](CLIN-QA-539-consentimento-do-portal-registrado.md) (reconferido pelo PO) |
| L-LG-09 anonimização não limpa `agendamentos.observacoes` | P2 | 513 (CA11) |
| Growth: limites de Pro e Ultra | P1 comercial (hipótese) | [540](CLIN-QA-540-limites-dos-planos-conferidos.md) |
| Growth: landing promete ICP via Memed (`:146`) | P1 | 515 (CA-R2) |

## O que só o responsável destrava

| Decisão ou ação | Histórias destravadas |
|---|---|
| Rodar `docs/seguranca/consultas-vps-somente-leitura.sql` na VPS (C1), com as consultas 2.5, 6.1 e 8.1 | 501, 502, 503, 512, 516, 563, SEC-R1-06 |
| Confirmar se o portal com dependentes está publicado | 512 (CA0) |
| Decisão C5 sobre as conversas herdadas do WhatsApp | 507, 536 |
| Decisões D1 a D4 do backup | 509, 514 |
| Parecer do DPO: anonimização e `audit_log`, regra dos 18 anos, quem decide pedidos do titular, nome social | 513, 512, 538, 556 |
| Autorizar commit e PR, separados por P0 | 510 (primeiro run no Actions), publicação de 504 a 508 |
| Aprovar as ADRs 0001 e 0003 | 534, 522 |
| Decidir sobre o aviso de receita controlada antes do prazo do SNCR | 591 |
| Preço e limites dos planos | 540 |

## Rastreabilidade: épico do diagnóstico → histórias

| Épico | Gravidade | Histórias |
|---|---|---|
| CLIN-QA-001 RPCs acessíveis a anon | P0 | 501, 502, 503 |
| CLIN-QA-002 Isolamento sem prova executada | P0 | 510, 511 |
| CLIN-QA-003 Paciente errado nos canais públicos | P0 | 504, 505, 506, 507, 512, 536, 537 |
| CLIN-QA-004 Exclusão LGPD apaga dado clínico | P0 | 508, 513, 538, 539 |
| CLIN-QA-005 Backup no mesmo host | P0 | 509, 514 |
| CLIN-QA-006 Repositório ≠ produção | P1 | 516, 517, 518 |
| CLIN-QA-007 MFA só no cliente | P1 | 520, 521 |
| CLIN-QA-008 Papel global e convite | P1 | 519, 534 |
| CLIN-QA-009 Webhook do WhatsApp frágil | P1 | 522, 523 |
| CLIN-QA-010 TISS inexistente | P1 | 529, 530, 535 |
| CLIN-QA-011 ICP-Brasil inexistente | P1 | 531, 532 |
| CLIN-QA-012 Identificação do paciente | P1 (555 é P0 suspeito) | 524, 525, 526, 555 |
| CLIN-QA-013 Código de barras prometido | P1 | 515, 533 |
| CLIN-QA-014 Cache sem tenant e tipos | P1 | 527, 528 |
| Comercial (planos) | P1 | 540 |

Os P2 e P3 do diagnóstico (CLIN-QA-015 a 036) continuam na seção D.4 e serão quebrados nas próximas rodadas. A faixa do PO tem 541 a 549 livres.

## Gate de saída da estabilização
De `docs/time/GATES.md`, seção 2.2: zero P0 aberto (501 a 514, 512 e 555 aceitas, com E4 para fechar), 510 verde como job obrigatório e o smoke das jornadas em staging (depende da 518) sem falha crítica.

## Definição de pronto comum
Vale para toda história, além do que cada arquivo acrescenta:

1. Cada critério de aceite tem evidência registrada no próprio arquivo, na seção de situação ou de validação: comando executado e resultado, teste nomeado ou `caminho:linha`. O que não tem prova fica marcado `NÃO VERIFICADO`, e a história não é aceita.
2. `npx tsc --noEmit -p tsconfig.app.json` sem erro, `npm run lint` sem erro novo e `npm run test:run` verde. Há testes novos para os critérios da camada tocada: unitário, banco (pgTAP, PGlite ou spec com banco local) ou e2e.
3. Os critérios de outra clínica e de permissão negada foram executados, não só escritos.
4. Se a história toca o banco, a migration existe só localmente, foi revisada pelo `database-engineer` e tem a reversão comentada. Aplicar exige autorização do responsável e backup prévio. `npm run check:colunas` sem divergência.
5. Se toca acesso, autenticação ou rota pública, tem revisão do `security-engineer` registrada.
6. Se toca a interface, roda `npm run check:falhas`, `npm run check:permissoes` e `npm run check:a11y`. O texto é formal, sem exclamação, emoji ou mojibake, e os erros passam por `src/lib/erros.ts`, sem mensagem técnica crua.
7. Só dados sintéticos em testes, seeds e capturas. Nenhum segredo em código, log ou anexo.
8. Itens de TISS, ICP-Brasil, LGPD, RDC e CFM marcados como "requer avaliação especializada", sem simular conformidade.
9. O PO confere cada critério com a evidência e muda o status para Aceita ou Recusada, com motivo.
10. Sem deploy, commit ou push sem pedido do responsável.
