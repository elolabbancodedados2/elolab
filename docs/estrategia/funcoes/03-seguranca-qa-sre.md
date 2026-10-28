# 03 — Segurança, QA e SRE

Diagnóstico de 27/10/2026, feito no worktree `admin-finance-realtime` (branch `feat/recepcao-painel-dia-melhorias`). Foi uma análise estática do repositório, com execução local apenas de `tsc` e `vitest`. Não houve acesso a produção. Por isso, tudo o que depende do estado real do banco está marcado como **NÃO VERIFICADO**. O drift já registrado (125 tabelas na VPS contra 136 nas migrations, `docs/AUDITORIA_MODULOS_QA.md`) impede supor que o banco reflita as migrations.

## 1. Policies permissivas (`USING (true)`, `WITH CHECK (true)`, `TO anon`)

O levantamento foi feito com `grep -E "(using|check)\s*\(\s*true\s*\)"` e `TO anon` sobre as 454 migrations. Depois, rastreei o nome de cada policy em todas as migrations posteriores.

| # | Tabela / policy | Origem | Destino final nas migrations | Estado |
|---|---|---|---|---|
| 1 | `employee_invitations` "Authenticated users can view invitations" | 20260131014446:18-22 | DROP em 20260812140000:8; substituída por `_scoped_v3` (:21-31) | corrigida |
| 2 | idem "…insert invitations" (`WITH CHECK (true)`) | 20260131014446:24-28 | DROP em 20260131014503:2 | corrigida |
| 3 | idem "…update invitations" | 20260131014446:30-34 | DROP em 20260131014503:3 | corrigida |
| 4 | `automation_logs` "Admins podem inserir logs" | 20260131022551:172-175 | DROP em 20260131022611:2 | corrigida |
| 5 | `mercadopago_webhook_logs` `webhook_logs_insert` | 20260303164042:129-130 | DROP em 20260322225957:9; `_restricted` (:12-14) | corrigida |
| 6 | `registros_pendentes` `anon_select_registros_by_code` (anon) | 20260314184928:2-6 | DROP em 20260322203714:18; estado final `anon … USING (false)` em 20261011380000:29-32 | corrigida |
| 7 | idem `authenticated_update_registros` | 20260314184928:9-14 | DROP em 20260314184948:2 | corrigida |
| 8 | idem `service_insert_registros` (anon) | 20260314184928:17-21 | DROP em 20260314184948:3 | corrigida |
| 9 | `feedbacks_nps` `nps_insert_policy` | 20260314230001:20-22 e 20260423191323:65-66 | DROP em 20260817290000:26-27 | corrigida |
| 10 | `feedbacks_nps` `nps_select_policy` | 20260314230001:25-27 e 20260423191323:68-69 | DROP em 20260817290000:28; `nps_select_clinica` (:29-30) | corrigida |
| 11 | `employee_invitations` `anon_select_invitation_by_token` | 20260318015218:3-7 | DROP em 20260812140000:15; `anon_block USING (false)` (:72-74) | corrigida |
| 12 | `funcionarios` `anon_select_funcionarios_for_invite` | 20260318015218:10-14, recriada em 20260321012953:42 | DROP em 20260322203714:7 e 20261011340000:23 | corrigida |
| 13 | `cid10` `cid10_select_authenticated` | 20260322203714:144-145 | sem alteração | ativa, aceitável (catálogo) |
| 14 | `plataforma_estado` leitura pública | 20260801220000:32-34 | intencional e comentada (:22-30) | ativa, aceitável |
| 15 | `planos` `planos_public_select` (`ativo = true`) | 20260730050000:49-51 | intencional | ativa, aceitável |

Observação: as policies de INSERT em `encaminhamentos` e `coletas_laboratorio` aceitam `clinica_id IS NULL` (20260321012953:223-224 e :231-232), o que permite criar linhas órfãs. Não verifiquei se uma migration posterior fechou isso.

**Conclusão:** nas migrations, nenhuma policy permissiva sobre dado de tenant continua ativa. No banco de produção, isso é **NÃO VERIFICADO**. O aceite proposto é rodar `select * from pg_policies where qual='true' or with_check='true' or 'anon'=any(roles)` na VPS e comparar o resultado com esta tabela (CLIN-QA-305).

## 2. Funções `SECURITY DEFINER` (amostra de 17)

**Achado estrutural:** a migration `20260728041952:4-29` revogou `EXECUTE` de `anon` uma única vez, e só alcançou as funções que já existiam naquela data. Não há nenhum `ALTER DEFAULT PRIVILEGES` nas migrations (o grep voltou vazio). No Supabase, as funções novas do schema `public` recebem `EXECUTE` para `anon` por privilégio padrão, e um `REVOKE … FROM PUBLIC` sozinho não retira esse grant. Depois de 28/07, cerca de 50 funções só recebem `REVOKE … FROM PUBLIC`.

| Função (versão vigente) | search_path | Checagem de tenant | Grant | Problema |
|---|---|---|---|---|
| `link_portal_paciente` 20261011010000:6-58 | ok | só quando `auth.uid() IS NOT NULL` (:17, :32) | `REVOKE FROM PUBLIC` (:60) | **Com anon, a checagem é pulada.** Quem souber um `paciente_id` gera um link válido por 1 ano (:49) e lê o portal de qualquer paciente. Suspeita de P0 |
| `platform_get_clinicas_saude` 20260817240000:44 | ok | mesmo padrão `auth.uid() IS NOT NULL AND NOT is_platform_admin()` | 20260817210000:127-128 | anon lê a saúde de todas as clínicas (cross-tenant). P1 |
| `verificar_saude_clinicas_e_alertar`, `watchdog_atendimento_travado`, `enfileirar_lembretes_retorno`, `expirar_ofertas_lista_espera` | ok | nenhuma (feitas para cron) | só `FROM PUBLIC` (20260817230000:144, 20260817150000:77, 20260817290000:71, 20260817293000:67) | anon dispara efeitos colaterais, como lembretes em massa. P2 |
| `accept_employee_invitation` 20260727230000:237-326 | ok | e-mail do convidado (:261-277) | anon (20260729180000:46) | Troca `profiles.clinica_id` de quem já pertence a outra clínica (:288-294), e os papéis se acumulam. P2 |
| `activate_public_registration` 20261010198000:181-216 | ok | `auth.uid()` | authenticated | Não confere se o e-mail do registro é o do usuário: quem tiver o código assume uma assinatura paga. P2 |
| `start_free_trial` | ok | — | revogada (20261010198000:219) | ok |
| `agendar_consulta_online_atomico` 20261009100000:3-104 | ok + pg_temp | valida clínica, médico e paciente | só service_role (:106-107) | ok |
| `find_patient_id_by_normalized_cpf` 20261001130000:3-23 | ok | por parâmetro | só service_role | ok |
| `aceitar_oferta_lista_espera` 20260817293000:36-56 | ok | — | só service_role | ok |
| `estornar_pagamento` 20260815230000:27-88 | ok | `is_same_clinica` + papel (:51-56) | `FROM PUBLIC` | ok, porque com anon `is_same_clinica` falha |
| `criar_cobranca_checkin_atomica` 20261001140000:165-233 | ok | sim | anon revogado | ok |
| `registrar_pagamento` 20261011310000:7-205 | ok | sim (:32-35) | anon revogado | ok |
| `liberar_resultados_laboratorio` 20261011180000:396-437 | ok | sim | anon revogado | ok |
| `validar_coleta_laboratorio` 20261011180000:256-293 | ok | sim | anon revogado | ok |
| `create_employee_invitation` 20261007181000:113-165 | `pg_catalog, public` | por parâmetro | só service_role | ok |
| `verificar_assinatura_prontuario` 20260818030000:155-176 | ok | por código UUID | anon, de propósito | expõe nome e CRM do signatário: aceitável |
| `validate_invitation_token` 20260415132402:4-46 | ok | por token | anon | devolve e-mail e papéis do convite: aceitável, P3 |

## 3. Edge functions públicas (`verify_jwt = false`)

| Função | Token / assinatura | Rate limit | Riscos |
|---|---|---|---|
| `patient-portal` | O token é guardado como hash SHA-256 (`index.ts:83`), mas ainda existe fallback para o token legado em texto puro (:96-104) | 60/min por IP (:52-56). Em `solicitar_acesso`: 5/10 min por IP e 3/h por CPF (:986-988) | O token vale 1 ano e é bearer, sem segundo fator. Os dependentes são resolvidos pelo "CPF do responsável" (:129-137), então um cadastro errado expõe o dependente a outra pessoa (P1). A solicitação de acesso envia o link só para os canais já cadastrados (:998-1030), o que está correto |
| `public-booking` | sem token, `aceite_lgpd` obrigatório (:177) | 60/min por IP, 10/h por IP e 3/dia por CPF (:101, :191-192) | **Reaproveita o paciente pelo CPF sem conferir a data de nascimento (:198).** Quem informar o CPF de outra pessoa cria a consulta no prontuário dela, e nome e telefone ficam só em `observacoes` (:239). Risco de paciente errado: P1. O aceite LGPD não é persistido |
| `public-checkout` | — | sim (:34) | Devolve o `invite_code` na resposta quando o e-mail falha (:344). É o próprio cadastro, então é aceitável |
| `mercadopago-webhook` | HMAC com comparação em tempo constante (`_shared/mercadoPagoSignature.ts:51-63`); o secret é obrigatório (:64-66) | não | **O `ts` não é conferido**, o que permite replay (P2) |
| `whatsapp-webhook` | compara o header com a `EVOLUTION_API_KEY` global (:33-38) | não | Comparação comum, não constante. Uma chave única para todas as clínicas: se vazar, permite forjar mensagens de qualquer tenant (P2). As mensagens de pacientes vão para a OpenAI (:259-290) |
| `public-guias-externas` | token em texto puro (`.eq("token", token)`, :67-71) | sim (:36) | Token sem hash (P3) |
| `init-db`, `auto-migrate` | stubs que respondem 410 | — | desativadas, ok |

Transversal: `_shared/rateLimit.ts:43-47` falha aberto (sem banco, sem limite), e `clientIp` (:55-58) confia em `x-real-ip`/`x-forwarded-for`. Se o proxy (Kong/Traefik) não sobrescrever esses headers, qualquer um contorna o limite por IP. Isso é **NÃO VERIFICADO** na VPS.

**MFA:** a exigência existe apenas no cliente (`src/pages/Auth.tsx:151-152`). Nenhuma policy ou função lê `auth.jwt()->>'aal'` (grep vazio em `supabase/`). Um usuário com MFA ativo é contornável chamando o PostgREST com o token AAL1 obtido só com a senha. Para admin de plataforma e impersonação, isso é P1.

## 4. tsc e vitest (testado)

- `npx tsc --noEmit -p tsconfig.app.json`: **exit 0 em 83 s, 0 erros**.
- `npx vitest run`: **exit 0; 205/205 arquivos e 1117/1117 testes passaram; 0 falhas**. Duração de 340 s segundo o vitest (385 s de relógio). Ressalva: rodou sem nenhuma variável de Supabase QA, ou seja, sem banco real, e portanto não prova RLS nem grants. Os stack traces no log são de testes de ErrorBoundary que provocam erros de propósito.

## 5. Suíte de isolamento

- `tests/isolamento-entre-clinicas.spec.ts` faz SELECT de A sobre `pacientes` (:90-105) e sobre `agendamentos, prontuarios, prescricoes, lancamentos, retornos, feedbacks_nps` (:107-117), além de 4 ações do WhatsApp (:119-180). O filtro `.filter(Boolean)` (:114) ignora linhas com `clinica_id` nulo, que justamente seriam vazamento.
- `tests/rls.spec.ts` cobre a leitura anônima de 16 tabelas (:25-44), a escrita anônima (só em banco descartável, :74) e 3 edge functions (:126-170).
- `tests/perfis-rbac.spec.ts` cobre 5 perfis de UI e o portal.
- **No CI, nada disso roda.** Toda a suíte exige `QA_SUPABASE_URL` em loopback (`scripts/test-supabase-env.ts:44-46`), e `.github/workflows/test.yml` não define nenhuma variável `QA_*` (grep: 0) nem sobe um Supabase local. O resultado são testes *skipped*. O `db lint` aponta para `gebygucrpipaufrlyqqj` (`test.yml:51`), que não é a produção.
- Lacunas: RPCs `SECURITY DEFINER` chamadas por anon e por outro tenant, Storage, Realtime, UPDATE e DELETE cross-tenant, além de uma verificação de grants (`has_function_privilege('anon', …)`).

## 6. LGPD técnica (requer avaliação especializada)

| Tema | Evidência | Lacuna |
|---|---|---|
| Consentimento | `lgpd_consent_log` (20260729140000:35); `ConsentimentoLGPD.tsx` | O aceite do agendamento público não é gravado (`public-booking/index.ts:177`) e não há versão do termo |
| Exportação | `exportPatientData` (`src/lib/lgpdCompliance.ts:45`) | Roda no cliente, sujeita ao RLS do operador; sem formato estruturado nem log de entrega ao titular |
| Exclusão | `deletePatientData` (`lgpdCompliance.ts:130-190`) | Apaga `prontuarios`, `triagens`, `exames` e `agendamentos` num laço não transacional (:170-189). Só o prontuário assinado é protegido (20260728034201:98-99), e o cadastro é preservado pelo trigger 20261007200000:52-56. Resultado: há **apagamento definitivo de dado clínico não assinado**, sem anonimização e em conflito com a guarda de 20 anos (Lei 13.787/2018). P1 |
| Logs de acesso | `prontuario_leitura_auditada` (20261011280000:138), `trg_audit` (20260817120000:226) | Não há retenção definida e o relatório ao titular não foi verificado |
| Transferência internacional | `ai-medical-assistant` → `api.openai.com` (:26), com `store:false` (:36) e restrito a médico/admin (:112-120); `whatsapp-webhook` envia mensagens de pacientes | Sem pseudonimização prévia, sem registro de base legal e sem opt-out por clínica verificado. Precisa de DPA e cláusulas-padrão |

## 7. Plano SRE

| Ordem | Item | Esforço | Detalhe |
|---|---|---|---|
| 1 | Backup off-site criptografado | M | Hoje o `auto-backup` grava no Storage da própria VPS (`auto-backup/index.ts:170-207`). Trocar por `pg_dump`/pgBackRest com envio a R2 ou S3 em outra região, criptografia `age`/AES e chave fora da VPS |
| 2 | Restauração testada | M | Restaurar mensalmente numa VM descartável (DB, Auth e Storage), conferindo contagens e checksums, e registrar o RTO medido |
| 3 | PITR (WAL-G ou pgBackRest) | M | Arquivamento de WAL contínuo para R2. Alvo: **RPO ≤ 5 min, RTO ≤ 4 h** |
| 4 | Staging | M | Segunda instância, alimentada pelas mesmas migrations e com dados sintéticos. Todo o CI de RLS e isolamento roda nela ou num Supabase local no runner |
| 5 | Observabilidade | S-M | Sentry (front e edge) com scrubbing de PII; `postgres_exporter` + Grafana (conexões, locks, bloat, replicação); uptime externo (Better Stack/UptimeRobot) e status page |
| 6 | Runbooks | S | `docs/operations` hoje tem só `SEED_TEMPLATES.md`. Criar runbooks para restauração, vazamento de dados (comunicação à ANPD), VPS fora do ar, disco cheio, rotação de chaves e rollback de migration |
| 7 | Reconciliar drift | M | Gerar o diff de schema entre a VPS e as migrations e criar uma migration de baseline |
| 8 | Sair da VPS única | L | Fase A: Postgres em host separado com réplica *streaming* em outra zona. Fase B: Supabase gerenciado (região sa-east-1, PITR nativo) ou Kubernetes com Patroni. Avaliar o custo para centenas de clínicas |

## 8. Backlog

| ID | P | Título | Reprodução | Evidência | Proposta | Esf. | Aceite | Dono |
|---|---|---|---|---|---|---|---|---|
| CLIN-QA-301 | **P0 (suspeito)** | anon gera link do portal de qualquer paciente | `POST /rest/v1/rpc/link_portal_paciente` com a anon key e um `p_paciente_id` | 20261011010000:17,32,60 | `REVOKE … FROM anon`; exigir `auth.uid()` ou `pg_trigger_depth()>0` | S | `has_function_privilege('anon',…)=false`, e a chamada anon retorna 42501 | Backend |
| CLIN-QA-302 | P1 | Funções sem revoke de anon depois de 28/07 | `select proname from pg_proc where prosecdef and has_function_privilege('anon',oid,'execute')` | 20260728041952:4-29; ausência de `ALTER DEFAULT PRIVILEGES` | `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon, public` + revoke em massa + allowlist | S | a consulta devolve só a allowlist, conferida no CI | Backend |
| CLIN-QA-303 | P1 | anon lê a saúde de todas as clínicas | RPC `platform_get_clinicas_saude` com a anon key | 20260817240000:44 | exigir `is_platform_admin()` ou service_role | S | anon recebe 42501 | Backend |
| CLIN-QA-304 | P1 | MFA contornável via API | login por senha → token AAL1 → PostgREST | `Auth.tsx:151`; nenhuma regra `aal` em SQL | policy restritiva `aal2` para platform admins e para quem tem fator ativo; MFA obrigatório para admins | M | token AAL1 de usuário com fator é negado | Backend |
| CLIN-QA-305 | P1 | Isolamento não roda no CI | ver o job e2e | `test.yml` sem `QA_*`; `test-supabase-env.ts:44-46` | `supabase start` no runner, seed de 2 clínicas e falha quando houver *skip* | M | job verde com mais de 0 testes de isolamento executados | QA |
| CLIN-QA-306 | P1 | Agendamento público grava no paciente errado | agendar com o CPF de um paciente existente e outro nome | `public-booking/index.ts:198` | exigir a data de nascimento igual, ou criar como "pré-cadastro" pendente de vínculo | M | um CPF com nascimento divergente não vincula | Backend |
| CLIN-QA-307 | P1 | A exclusão LGPD apaga dado clínico de forma não atômica | excluir um paciente com prontuário não assinado | `lgpdCompliance.ts:170-189` | RPC transacional de anonimização, preservando o prontuário | M | após o pedido, o prontuário continua e os identificadores ficam mascarados | Backend + DPO |
| CLIN-QA-308 | P1 | Backup na mesma VPS, sem restauração testada | — | `auto-backup/index.ts:170-207` | item 1-2 do plano SRE | M | relatório de restore com RTO medido | SRE |
| CLIN-QA-309 | P1 | Sem PITR nem staging | — | `docs/EASYPANEL-VPS.md:34-35` | itens 3-4 | M | PITR restaurado num timestamp escolhido | SRE |
| CLIN-QA-310 | P2 | Dependente exposto por CPF do responsável | cadastrar o CPF do responsável errado | `patient-portal/index.ts:129-137` | vínculo explícito validado pela clínica | M | o dependente só aparece com vínculo confirmado | Backend |
| CLIN-QA-311 | P2 | Replay do webhook do Mercado Pago | reenviar uma requisição assinada antiga | `mercadoPagoSignature.ts:58-63` | tolerância de `ts` de 5 min + idempotência por `x-request-id` | S | `ts` antigo devolve 401 | Backend |
| CLIN-QA-312 | P2 | Rate limit falha aberto e IP forjável | enviar `x-forwarded-for` aleatório | `rateLimit.ts:43-58` | IP vindo só do proxy confiável; falhar fechado nos endpoints sensíveis | S | header forjado não reinicia a cota | Backend/SRE |
| CLIN-QA-313 | P2 | Funções de cron chamáveis por anon | RPC `enfileirar_lembretes_retorno` | 20260817290000:71 | revogar anon e authenticated | S | 42501 | Backend |
| CLIN-QA-314 | P2 | Convite troca a clínica de usuário existente | aceitar um convite de B estando em A | 20260727230000:288-294 | recusar se `clinica_id` já existir e for diferente | S | o aceite retorna erro | Backend |
| CLIN-QA-315 | P2 | Ativação paga sem vínculo de e-mail | usar o código de outra pessoa | 20261010198000:193-195 | comparar o e-mail do registro com `auth.email()` | S | e-mail divergente é negado | Backend |
| CLIN-QA-316 | P2 | Chave da Evolution compartilhada entre tenants | — | `whatsapp-webhook/index.ts:33-38` | secret de webhook por instância, comparado em tempo constante | M | token de uma instância não aceita evento de outra | Backend |
| CLIN-QA-317 | P2 | Observabilidade e runbooks | — | `docs/operations` vazio | item 5-6 | M | alerta de uptime testado; 6 runbooks | SRE |
| CLIN-QA-318 | P2 | Drift de schema | — | `AUDITORIA_MODULOS_QA.md` | item 7 | M | diff vazio | SRE |
| CLIN-QA-319 | P3 | Fallback do token legado do portal e token de guias em texto puro | — | `patient-portal/index.ts:96-104`; `public-guias-externas/index.ts:67-71` | remover o fallback; guardar hash | S | token antigo é recusado | Backend |
| CLIN-QA-320 | P3 | Aceite LGPD não persistido e transferência à OpenAI | — | `public-booking/index.ts:177`; `ai-medical-assistant/index.ts:26` | gravar o consentimento com versão; pseudonimizar o prompt; DPA | M | registro existe a cada agendamento | Produto + DPO |

## Não realizado

- Nenhuma consulta ao banco de produção. Os grants reais (`has_function_privilege`), as policies vigentes e o drift continuam **NÃO VERIFICADOS**. CLIN-QA-301 e CLIN-QA-303 dependem dessa checagem para sair de "suspeito" para confirmado.
- Playwright e as suítes e2e não foram executados (exigem Supabase local, que não foi iniciado).
- A configuração de Kong/Traefik (headers de IP) e os backups do Easypanel não foram inspecionados.
- A revisão de `SECURITY DEFINER` foi amostral (17 de mais de 215 migrations). As edge functions `whatsapp-evolution`, `fhir-export`, `patient-clinical-summary` e `mercadopago-oauth` foram lidas só superficialmente ou não foram lidas.
- A conformidade LGPD e CFM e as certificações (SBIS, ISO 27001) requerem avaliação especializada.
