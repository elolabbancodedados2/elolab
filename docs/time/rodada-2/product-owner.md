# Rodada 2: product-owner

Data: 27/10/2026. Só documentação e validação. Não alterei código de produto, migration, workflow nem testes. Sem deploy, commit ou acesso à VPS.

## O que fiz

- Li `docs/time/REGRAS_DO_TIME.md`, `docs/time/GATES.md`, o consolidado da rodada 1, os resumos da leva 2 da rodada 1 e os sete resumos da rodada 2 (security, database, backend, qa, devops, tech-lead e frontend).
- Atualizei as **34 histórias da rodada 1** com o status real e uma seção "Situação após as rodadas 1 e 2" (o que existe, o que falta, critérios novos quando houve, validação do PO).
- Reescrevi a **CLIN-QA-512**: voltou a P0 confirmado. Entraram a cadeia do link público (571), o fato de os dependentes não existirem no `HEAD` (TL-R2-01) e os critérios novos CA0 (contenção), CA7 (cadeia 571) e CA8 (maioridade).
- Criei **7 histórias novas**:
  - **555**: P0 suspeito, o prontuário grava sempre no paciente exibido. Validei por critério a entrega do frontend da rodada 2.
  - **535**: receita em dobro no convênio (L-FC-01).
  - **536**: vínculo manual de conversa do WhatsApp (L-ID-02).
  - **537**: duplicata silenciosa pelo link (L-ID-03).
  - **538**: registro único dos pedidos do titular (L-LG-02 e L-LG-05).
  - **539**: consentimento do portal viola o CHECK (L-LG-08).
  - **540**: limites dos planos à venda.
- Acrescentei critérios a três histórias: 504 (CA-R2, item 571), 513 (CA9 `aal2`, CA10 aprovação dupla, CA11 cópias de dado pessoal) e 515 (CA-R2, ICP via Memed).
- Reescrevi `docs/produto/backlog/README.md` com:
  - legenda de status ligada aos estados do `GATES.md`;
  - resumo por status;
  - fila ordenada, com 512 e 555 no topo;
  - registro de todos os itens novos dos agentes (UX 551 a 558, QA 561 a 568, segurança 571 a 579 e SEC-R1-06, tech-lead TL-R2-01 a 11, especialista, business-analyst e growth), cada um apontando para a história que o cobre;
  - tabela "O que só o responsável destrava".
- Tomei duas decisões de produto:
  - **568:** os ramos de CPF duplicado ficam cobertos por teste de unidade com dado legado simulado, sem seed, e não bloqueiam a 510.
  - **577:** nenhuma ferramenta nova do bot com dado clínico sem confirmação por posse.

## Estado do backlog (41 histórias)

| Status | Qtde | Histórias |
|---|---|---|
| Aguardando aplicação | 2 | 502, 503 |
| Feito localmente | 8 | 504, 505, 506, 508, 510, 524, 525 (Recepção), 555 |
| Bloqueado por decisão do responsável | 9 | 501, 507, 509, 513, 516, 529, 531, 538, 540 |
| Aberto (parcial) | 3 | 511, 517, 526 |
| Aberto | 19 | 512, 514, 515, 518 a 523, 527, 528, 530, 532 a 537, 539 |

**Nenhuma história Aceita.** Nenhum critério tem evidência em homologação (E3). P0 que mantêm o NO-GO: 512 (confirmado), 555 (suspeito até o teste de tela U2) e os épicos 001 a 005, todos no máximo em `testado localmente`.

## Arquivos tocados

- `docs/produto/backlog/README.md` (reescrito)
- `docs/produto/backlog/CLIN-QA-501` a `CLIN-QA-534` (34 arquivos: status e seção nova; 512 reescrita)
- Novos: `docs/produto/backlog/CLIN-QA-535-convenio-sem-receita-em-dobro.md`, `CLIN-QA-536-whatsapp-vinculo-manual-pela-equipe.md`, `CLIN-QA-537-link-publico-sem-duplicata-silenciosa.md`, `CLIN-QA-538-pedidos-do-titular-em-registro-unico.md`, `CLIN-QA-539-consentimento-do-portal-registrado.md`, `CLIN-QA-540-limites-dos-planos-conferidos.md` e `CLIN-QA-555-prontuario-grava-no-paciente-exibido.md`
- `docs/time/rodada-2/product-owner.md` (este arquivo)

Usei um script descartável no scratchpad para aplicar as seções nas 33 histórias. O PGlite foi instalado no scratchpad, fora do repositório.

## Evidências (comandos executados pelo PO, 27/10/2026)

| Comando | Resultado |
|---|---|
| `npx vitest run` com `lgpdExclusaoBloqueada`, `lgpdAnonimizacao`, `lgpdAnonimizacaoIntegracao`, `identificacaoPaciente` (lib), `IdentificacaoPaciente` (componente) e `qaSuitesSeguranca` | 6 arquivos, **82 de 82** |
| `npx vitest run src/lib/__tests__/pacienteDoRegistro.test.ts src/components/clinical/__tests__/IdentificacaoPaciente.test.tsx` | 2 arquivos, **35 de 35** |
| `node --test scripts/ci/falhar-se-pulado.test.mjs` | **9 de 9** |
| `node teste-revogar-anon.mjs supabase/migrations/20261028090000_revogar_anon_e_privilegios_padrao.sql` (PGlite 0.3.15, no scratchpad) | **63 linhas OK, 0 falhas**, saída 0 |
| `ls supabase/migrations \| cut -c1-14 \| sort \| uniq -d`; `wc -l` | `20261010198000`; 456 arquivos |
| `sed -n 150,154p vite.config.ts` | Ainda `createViteTestSupabaseDefine({})` (564 aberto) |
| `grep -n "código de barras" src/pages/LandingPage.tsx` | `:209` ainda promete (515 aberto) |
| `grep -n "EXCLUSAO_LGPD_DESTRUTIVA_HABILITADA =\|ANONIMIZACAO_LGPD_HABILITADA =" src/lib/lgpdCompliance.ts` | `:141 false`, `:165 false` |
| `grep -rln aal2 supabase/migrations supabase/functions` | Nenhum resultado (520 e 521 abertos) |
| `git show HEAD:supabase/functions/patient-portal/index.ts \| grep -c dependente` | `0` (confirma TL-R2-01) |
| Leitura de `src/pages/Prontuarios.tsx:882-888`, `:1202-1212`, `:1509-1520`, `:1712`, `:2110`, e `src/pages/Recepcao.tsx:24`, `:1528` | Guarda, fechamento do diálogo, rascunho e integração do componente presentes, como descreve o frontend |
| `patient-portal/index.ts:221`, `:243-250` e `20260729140000_...sql:39` | Confirma o 539: tipos em português contra o CHECK em inglês, sem conferir o erro |
| Script de links e `grep -nE "Ã[^O]\|Â"` no backlog | Todos os links do README existem; sem mojibake |

Não rodei: `tsc`, `vitest` e lint completos (ficam com o tech-lead, `TAREFAS-C`), testes Deno, Playwright, nada contra banco real ou navegador.

## Validação das entregas da rodada 2 (visão do PO)

| Entrega | Histórias | Veredito do PO |
|---|---|---|
| database-engineer, migration 001 | 502, 503 | Testes reproduzidos (63 de 63). Pronta para aplicação, condicionada a C1 e à revisão da segurança. Não aceita: falta E3 |
| frontend-developer, 545, 401 e 402 | 555, 524, 525 | CA1 a CA5 da 555 têm correção coerente (E1). Três testes leem o texto do código, o que não prova comportamento. **Recuso fechar a 555** sem o teste de tela U2. 524 e 525 estão feitas localmente, sem teste de tela |
| backend-developer, SEC-R1-06 e 512 | 512 | SEC-R1-06 correto pela revisão do tech-lead. **A 512 não está mitigada**: o critério CA0 (contenção) não foi atendido |
| tech-lead, integração LGPD | 508, 513 | Trava desligada confirmada e testes passando. A 513 segue bloqueada pelo parecer do DPO |
| qa-engineer e devops-sre, CI | 510, 511 | O código existe e os testes de unidade passam, mas o job nunca rodou. Não há prova de S2 nem de S3 |

## Pendências

1. **Responsável:** as decisões da tabela "O que só o responsável destrava" do README. As mais urgentes são C1 com as consultas 2.5, 6.1 e 8.1, a confirmação do que está publicado do portal (512) e o aviso de receita controlada antes do prazo do SNCR (591) **[requer avaliação especializada]**.
2. **especialista-dominio-saude:** renumerar os achados 501 a 509 de `docs/produto/dominio/requisitos-regulatorios.md` para 591 a 599. Hoje eles colidem com as histórias do PO.
3. **PO, próxima rodada:**
   - escrever as histórias de 552, 553, 556, 591, 595, 596, 597 e 599;
   - quebrar os P2 e P3 do diagnóstico (015 a 036).

   A faixa 541 a 549 está livre.
4. **frontend-developer e designer:** reaproveitar o 551 a 558 pela numeração nova. Os resumos da rodada 2 ainda citam "545", "401" e "402".

## Próximo dono

- **backend-developer:** 512 CA0 (contenção, sem decisão pendente), 576 e 573.
- **qa-engineer:** teste de tela U2 da 555 e simulação de H1.
- **tech-lead:** verificação completa (`TAREFAS-C`) e 564.
- **database-engineer:** pendências da 513 que não dependem do DPO (PGlite com falha simulada, `search_path`, `aal2`, 578).
- **clinical-quality-director:** usar a tabela de status do README no consolidado da rodada 2.
