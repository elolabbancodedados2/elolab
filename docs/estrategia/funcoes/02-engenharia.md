# EloLab: diagnóstico de engenharia e arquitetura-alvo

Data: 27/10/2026. Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, com alterações locais não commitadas. Fiz só leitura. Nenhuma migration foi aplicada e nada foi publicado.

Convenção: **[O]** indica observação com evidência no repositório; **[H]** indica hipótese ou inferência; `NÃO VERIFICADO` indica que não há prova local.

## 0. Conferência dos fatos recebidos

| Fato | Resultado |
|---|---|
| 454 migrations, prefixo duplicado `20261010198000` | [O] confirmado: `20261010198000_checkout_provisionamento_seguro.sql` e `20261010198000_mercadopago_oauth_clinicas.sql` |
| 47 edge functions, incluindo `auto-migrate` e `init-db` | [O] 47 pastas mais `_shared`. **Correção:** `auto-migrate` e `init-db` hoje são stubs que respondem 410 (`supabase/functions/auto-migrate/index.ts:20-27`, `supabase/functions/init-db/index.ts:17-24`) |
| Cerca de 550 `.from()` | [O] 598 ocorrências em `src`, das quais 400 ficam em `src/pages` e `src/components`. Há 273 `(supabase as any)` |
| `App.tsx` com cerca de 29K | [O] 30.215 bytes |
| Telas gigantes | [O] confirmado: Prontuarios 2.635, Pacientes 2.491, PortalPaciente 2.463, CaixaDiario 2.353, Recepcao 1.837, Exames 1.768, Laboratorio 1.439, ContasReceber 1.393, Relatorios 1.330, Fila 1.312 |
| Cores fixas | [O] 1.469 ocorrências no padrão `bg/text/border-<cor>-NNN` ou `#RRGGBB` em `.tsx`. O número difere de 1.118 porque o critério foi outro. Exemplo: `src/pages/Interoperabilidade.tsx:66` |
| CI aponta para o Cloud | [O] `.github/workflows/test.yml:70` executa `supabase link --project-ref gebygucrpipaufrlyqqj`. Se esse ref é diferente da produção: `NÃO VERIFICADO` aqui (consta da memória do projeto) |

## 1. Arquitetura-alvo multiunidade

### 1.1 Estado atual das helpers [O]

- `get_my_clinica_id()` é `STABLE SECURITY DEFINER` e lê `profiles.clinica_id` por `auth.uid()` (`supabase/migrations/20260321012844_66decb2c-f8bb-4bc9-94ef-5773a3db99f8.sql:76-84`). Em `20260508172810_6e93f396-….sql:10` ela recebe `GRANT EXECUTE … TO authenticated, anon`.
- `current_clinica_id()` repete a mesma lógica (`20260522171216_def6af16-….sql:59-67`).
- `is_same_clinica(uuid)` é `STABLE SECURITY DEFINER`, devolve `false` para NULL e compara com uma subconsulta em `profiles` (`20260923100000_is_same_clinica_nunca_aceita_null.sql:16-32`).
- `has_role(_user_id, _role)` consulta `user_roles` sem clínica (`20260131002504_e20769f5-….sql:58-69`). A tabela `user_roles` tem `UNIQUE(user_id, role)` e **não tem `clinica_id`** (`mesmo arquivo:42-49`). Um vazamento entre clínicas já ocorreu por esse motivo (`20260729120000_user_roles_vazamento_entre_clinicas.sql:1-33`).
- As policies usam quatro formas diferentes: `is_same_clinica(clinica_id)` 315 vezes, `clinica_id = public.get_my_clinica_id()` 135, `clinica_id = get_my_clinica_id()` 73 e `clinica_id = public.current_clinica_id()` 32.
- Há 1.284 menções a `auth.uid()` nas migrations e **nenhuma** no padrão `(select auth.uid())`.
- Há 86 linhas `CREATE INDEX` com `clinica_id`. A cobertura de cada tabela com RLS está `NÃO VERIFICADA`.

**Consequências.** [H] O papel é global, e um mesmo usuário não consegue ter papéis diferentes em clínicas diferentes. `profiles.clinica_id` é escalar, então o usuário pertence a uma única clínica e o modelo de rede fica impedido. Funções `SECURITY DEFINER` não são inlined pelo planner. Por isso, `is_same_clinica(clinica_id)` pode ser avaliada linha a linha, em vez de virar uma constante de initPlan.

### 1.2 Modelo de dados proposto

```
organizacoes (id, nome, cnpj_matriz, plano, sso_config_id)
clinicas      + organizacao_id uuid NOT NULL  -- "unidade"; mantém o nome clinica_id
membros_unidade (user_id, clinica_id, papel app_role, ativo, PRIMARY KEY (user_id, clinica_id, papel))
membros_organizacao (user_id, organizacao_id, papel_org)  -- dono/gestor de rede
profiles.clinica_id  -> passa a ser "unidade ativa" (preferência), não fonte de autorização
```

Tabelas compartilhadas da rede (por exemplo, catálogo de exames, tabela de preços e cadastro de convênio) recebem `organizacao_id` e, opcionalmente, `clinica_id` NULL quando são comuns a toda a rede. Dados clínicos e financeiros continuam presos a `clinica_id`. Pacientes compartilhados em rede ficam para uma fase 2, com uma tabela de vínculo `paciente_unidade`, porque é uma decisão de LGPD e de produto.

### 1.3 Migração sem big bang

1. **Expand.** Criar `organizacoes` e gerar uma organização 1:1 para cada clínica existente. Preencher `clinicas.organizacao_id`. Criar `membros_unidade` a partir de `profiles.clinica_id × user_roles`. Nenhuma policy muda nesta etapa.
2. **Helpers novas** (`LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''`):
   - `minhas_unidades() RETURNS SETOF uuid`;
   - `tem_papel(p_clinica uuid, p_papel app_role)`;
   - `unidade_ativa()`, que lê o claim `app_metadata.clinica_ativa` do JWT por meio de um Custom Access Token Hook e cai para `profiles.clinica_id` quando o claim não existe.
3. **Reescrever as helpers antigas por dentro**, mantendo a assinatura. `is_same_clinica(x)` passa a ser `x = ANY(array(select minhas_unidades()))`, e `get_my_clinica_id()` passa a devolver `unidade_ativa()`. Os 555 usos em policies continuam funcionando sem `DROP`.
4. **Normalizar as policies em lotes por domínio.** Mudar `USING (is_same_clinica(clinica_id))` para `USING (clinica_id IN (select minhas_unidades()))` ou `clinica_id = (select unidade_ativa())`. Fazer cada lote em uma migration com teste pgTAP.
5. **Contract.** Trocar `has_role(uid, role)` por `tem_papel(clinica, role)` e deixar `user_roles` apenas como leitura. Só remover a tabela depois de dois ciclos de release.

### 1.4 Desempenho

- Envolver chamadas em `(select …)` para gerar initPlan, por exemplo `(select auth.uid())` e `(select unidade_ativa())`.
- Criar índice B-tree em `clinica_id` em toda tabela com RLS, ou um índice composto `(clinica_id, data)` nas tabelas quentes: `agendamentos`, `lancamentos`, `fila_atendimento` e `prontuarios`.
- Criar o índice `membros_unidade(user_id) INCLUDE (clinica_id, papel)`.
- Tirar `anon` do `GRANT EXECUTE` das helpers de tenant.
- Aceite: `EXPLAIN (ANALYZE)` com `SET request.jwt.claims` mostra `InitPlan` e `Index Scan` em `agendamentos` com 1M de linhas, em menos de 50 ms.

## 2. Saneamento de migrations

[O] São 454 arquivos que misturam UUIDs do Lovable e nomes descritivos, e há colisão de versão em `20261010198000`. [O] O processo atual é manual, pelo SQL Editor e "uma por vez" (`supabase/APLICAR_MIGRATIONS.md:1-10`). [H] O registro em `supabase_migrations.schema_migrations` da produção provavelmente diverge do repositório (`NÃO VERIFICADO`).

Plano para baseline:

1. Fazer `pg_dump --schema-only` da produção self-hosted (schemas `public`, `storage` policies e `cron`) e comparar com um banco efêmero gerado por `supabase db reset` a partir das 454 migrations. Usar `migra` ou `supabase db diff`. O drift é o primeiro entregável.
2. Gerar `00000000000000_baseline.sql` a partir do dump já reconciliado. Mover os 454 arquivos para `supabase/migrations_legacy/`, fora do caminho do CLI.
3. Em produção, **não executar** o baseline. Basta registrar a versão com `supabase migration repair --status applied 00000000000000`, depois de backup. As migrations seguintes rodam a partir daí.
4. Adotar a regra: prefixo único com timestamp UTC, uma migration por PR e aplicação via `supabase db push --db-url` em um job de deploy com aprovação manual. Não usar mais o SQL Editor.
5. Corrigir o CI (`test.yml:70`) para subir um Postgres efêmero com `supabase start` ou `db reset` e rodar `db lint` e pgTAP de RLS contra ele, em vez de fazer `link` com um projeto Cloud.

**auto-migrate/init-db.** [O] Os dois foram neutralizados e documentam que expunham DDL com service role e `verify_jwt=false`, além de não estarem no repositório (`auto-migrate/index.ts:2-18`). O risco residual é o slug ainda publicado e o processo que permitiu publicar uma função fora do repositório. Proposta: remover os slugs do servidor e criar um job que compare as funções publicadas com o repositório (lista e hash) e falhe quando houver divergência.

## 3. Camada de dados no frontend

[O] Há 598 `.from()` diretos e 273 `(supabase as any)`. Isso indica que `src/integrations/supabase/types.ts` está desatualizado em relação ao schema. [O] O hook genérico já inclui o tenant na chave (`src/hooks/useSupabaseData.ts:42`), mas invalida por prefixo de tabela (`:149`). [O] Das 581 `queryKey` literais, só 180 incluem `clinica`. Exemplos são `['agendamentos']` e `['fila_atendimento']`. [H] Na troca de unidade, isso pode mostrar dados em cache da unidade anterior.

Proposta incremental:

- Criar `src/data/queryKeys.ts` com uma fábrica `qk.agendamentos.list(clinicaId, filtros)`, em que o primeiro segmento é sempre `[clinicaId, dominio, …]`. Ao trocar de unidade, chamar `queryClient.removeQueries({ queryKey: [old] })`.
- Criar `src/data/<dominio>/repo.ts` com funções puras tipadas, como `listarAgendamentos(clinicaId, periodo)`, e `hooks.ts` com `useQuery` e `useMutation`. Os componentes não importam `supabase`. Um ESLint `no-restricted-imports` em `src/pages/**` entra como warning e passa a error por domínio já migrado.
- Regenerar os tipos no CI (`supabase gen types`) e comparar com o arquivo commitado.

Ordem de ataque, por volume e risco: (1) `agendamentos` e `fila_atendimento` (51 chamadas, realtime e recepção); (2) `pacientes` e `prontuarios` (47, dado sensível); (3) `lancamentos`, `pagamentos` e caixa (41, dinheiro); (4) `coletas_laboratorio` e `exames` (34); (5) `configuracoes_clinica` (25, lido em toda parte, bom candidato a um `useClinicaConfig` único).

## 4. Quebra das telas gigantes e design system

Padrão para cada tela: `pages/X/index.tsx`, com rota e layout em menos de 200 linhas; `X/hooks/` para dados, vindos da camada do §3; `X/components/` para seções e diálogos; `X/model.ts` para regras puras testáveis. Antes de extrair, fixar o comportamento com testes de caracterização, em Vitest e Testing Library, nos fluxos críticos.

| Tela | Linhas | Fatias sugeridas |
|---|---|---|
| Prontuarios | 2.635 | lista/busca, editor SOAP, sinais vitais, prescrição/anexos, assinatura |
| Pacientes | 2.491 | lista, formulário (com validação zod), histórico, convênios do paciente |
| PortalPaciente | 2.463 | separar como bundle de rota própria: agendamentos, resultados, financeiro |
| CaixaDiario | 2.353 | abertura/fechamento, movimentos, recebimento, conciliação; regras para `model.ts` |
| Recepcao | 1.837 | painel do dia, check-in, fila; reutilizar o domínio agenda |
| Exames / Laboratorio | 1.768 / 1.439 | pedido, coleta, laudo; preparar o ponto de entrada de equipamentos (§6) |
| ContasReceber / Relatorios / Fila | cerca de 1.300 cada | filtros, tabela, ações em lote |

Meta: nenhum arquivo novo acima de 400 linhas e um teto de linhas por arquivo no CI, no mesmo modelo do `check:a11y` (`test.yml:56-60`), que impede que a dívida cresça.

**Tokens.** [O] São 1.469 cores fixas, e há telas inteiras em hex (`Interoperabilidade.tsx:66`). Proposta: tokens semânticos em CSS variables (`--surface`, `--text-muted`, `--status-ok|warn|danger`, `--brand`) mapeados no Tailwind; um codemod que troque `text-[#52647a]` por `text-muted-foreground`; e uma regra de lint (`tailwindcss/no-arbitrary-value` ou regex no CI) com teto decrescente. Isso também habilita whitelabel por organização.

## 5. Backend e edge

- **Mercado Pago.** [O] A assinatura `x-signature` é obrigatória (`mercadopago-webhook/index.ts:61-85`). A idempotência usa `event_id` em `mercadopago_webhook_logs` com tratamento de `23505` (`:91-128`). O processamento é síncrono dentro do request. Proposta: persistir, responder 200 e processar em seguida por fila; reprocessar `processado=false` com backoff, por meio de `platform-reprocess-job`, já existente, com o comportamento `NÃO VERIFICADO`.
- **WhatsApp (Evolution).** [O] O token é comparado com `!==` (`whatsapp-webhook/index.ts:38`). Isso não é timing-safe, mas o risco é baixo. A deduplicação usa `message_id` com `23505` (`:145-217`). [O] Há chamada **síncrona à OpenAI** dentro do webhook (`:408`, `:537`). [H] Sob latência, o Evolution reenvia, o tempo de execução estoura e a resposta pode duplicar. Proposta: enfileirar e processar de forma assíncrona.
- **Filas.** [O] `notification_queue` é uma tabela com `tentativas/max_tentativas` e estados `erro` e `incerto` (`process-notification-queue/index.ts:39-52`), um bom desenho. Proposta: generalizar para `jobs` (tipo, payload, `run_after`, tentativas, `locked_until`) com `FOR UPDATE SKIP LOCKED`, e usar o estado terminal `dead` como DLQ, com tela no painel da plataforma. O pgmq é aceitável se a extensão estiver disponível no Postgres self-hosted (`NÃO VERIFICADO`), mas a tabela própria é suficiente na escala de centenas de clínicas.
- **Cron.** [O] 19 migrations com `cron.schedule` usam `net.http_post` para edge functions (`20260727235000_cron_segredo_proprio.sql:56-60`). Proposta: registrar os jobs em um único arquivo declarativo e monitorar `cron.job_run_details`, com alerta quando houver falha.
- **Runtime self-hosted.** O `edge-runtime` no Easypanel tem limites de memória e de wall-clock definidos pelo container (`NÃO VERIFICADO`). Trabalho pesado, como XML TISS, PDF, IA e backup, deve ir para um worker Node/Deno dedicado na VPS que consuma `jobs`, e não para uma edge function.

## 6. Integrações para grande mercado

| Integração | Estado [O] | Arquitetura sugerida | Build/buy | Esforço |
|---|---|---|---|---|
| **TISS XML + XSD ANS** | Existem lotes, glosas e as RPCs `criar_lote_tiss` e `registrar_envio_lote_tiss` (`FaturamentoConvenios.tsx:122,190`) e `convenios.versao_tiss`. Não há geração de XML validado: `xsd` só aparece em 1 migration e em 4 assets/arquivos | Um worker gera o XML a partir do lote, valida contra os XSD oficiais versionados por `versao_tiss` (libxml2/xmllint), calcula o hash MD5 do epílogo e guarda o XML no storage. Na fase 2, envio por webservice da operadora | Build, porque é o núcleo do produto; pacotes XSD vêm da ANS | L |
| **ICP-Brasil** | [O] Não existe. A assinatura atual é eletrônica simples, com hash local (`DigitalSignature.tsx:29-41`) | Provedor de assinatura em nuvem (PSC: BirdID, VIDaaS, SafeID) via OAuth, assinando PAdES/CAdES no backend; A3 local por agente desktop apenas sob demanda | Buy (provedor) | M |
| **NFS-e** | [O] Inexistente (0 ocorrências) | Agregador (por exemplo PlugNotas, Focus NFe, eNotas) acionado por um job após o recebimento, com webhook de retorno idempotente | Buy | M |
| **HL7/ASTM (equipamentos)** | [O] Só há exportação FHIR R4 (`supabase/functions/fhir-export`). Não há middleware de equipamento | Agente on-premise no laboratório, que lê serial/TCP com ASTM E1394/LIS2-A2 ou HL7 v2 ORU e envia HTTPS assinado para `lab-results-ingest`, com idempotência por `equipamento+amostra+teste` | Buy (middleware LIS) para os primeiros clientes; build quando houver volume | L |
| **SSO OIDC/SAML** | [O] Inexistente | Supabase Auth com SAML 2.0 (`signInWithSSO`) por organização, mapeando grupos para `membros_unidade`. A disponibilidade no GoTrue self-hosted precisa ser confirmada (`NÃO VERIFICADO`) | Buy/config; alternativa: Keycloak como broker | M |

## 7. Backlog

| ID | P | Evidência | Causa provável | Proposta | Esf. | Aceite | Dono |
|---|---|---|---|---|---|---|---|
| CLIN-QA-201 | P0 | `APLICAR_MIGRATIONS.md:1-10`; versão duplicada `20261010198000` | Deploy de banco manual, sem registro confiável | Comparação de drift entre produção e repositório e `migration repair`; deploy de DB por pipeline com aprovação | M | `supabase migration list --db-url` sem divergência; versões únicas | Tech Lead + DBA |
| CLIN-QA-202 | P0 | `user_roles` sem `clinica_id` (`20260131002504…:42-49`); vazamento em `20260729120000…:1-33` | Papel global | `membros_unidade` + `tem_papel(clinica, papel)` em expand/contract | L | pgTAP: admin da unidade A não lê nem escreve nada da B em todas as tabelas | DB Eng |
| CLIN-QA-203 | P0 | Helpers com `GRANT … anon` (`20260508172810…:10`) | Grants herdados do Lovable | Revogar `anon` de todas as helpers de tenant | S | `has_function_privilege('anon', …)` = false | DB Eng |
| CLIN-QA-204 | P1 | `test.yml:70` faz link com projeto Cloud | CI anterior ao self-hosted | Banco efêmero no CI + pgTAP de RLS | M | PR que remove uma policy quebra o CI | Tech Lead |
| CLIN-QA-205 | P1 | Quatro formas de policy (§1.1); zero `(select auth.uid())` | Policies geradas sem padrão | Reescrita por lote com `(select helper())` e índices em `clinica_id` | L | EXPLAIN com InitPlan; p95 de agenda < 300 ms com 1M de linhas | DB Eng |
| CLIN-QA-206 | P1 | 401 de 581 `queryKey` sem tenant (`useSupabaseData.ts:149`) | Ausência de fábrica de chaves | `qk` por tenant + limpeza ao trocar de unidade | M | Teste e2e: trocar de unidade não exibe nenhum dado anterior | Frontend |
| CLIN-QA-207 | P1 | `whatsapp-webhook/index.ts:408,537` | IA chamada de forma síncrona no webhook | Enfileirar em `jobs`; webhook responde em menos de 1 s | M | Reenvio do mesmo evento não gera segunda resposta | Backend |
| CLIN-QA-208 | P1 | TISS sem XML/XSD (§6) | Escopo não construído | Gerador e validador TISS no worker | L | XML do lote valida no XSD da versão do convênio; hash correto | Backend + Produto |
| CLIN-QA-209 | P1 | 273 `(supabase as any)` | Tipos desatualizados | `gen types` no CI + gate de diff | S | Diff zero; contagem de `as any` cai a cada sprint | Frontend |
| CLIN-QA-210 | P2 | 598 `.from()` em componentes | Ausência de camada de dados | Repositórios por domínio (§3) + regra de lint | L | `src/pages` sem `import supabase` nos domínios migrados | Frontend |
| CLIN-QA-211 | P2 | 10 telas com mais de 1.300 linhas | Crescimento orgânico | Quebra conforme §4 + teto de linhas no CI | L | Nenhum arquivo acima de 800 linhas; testes de caracterização verdes | Frontend |
| CLIN-QA-212 | P2 | 1.469 cores fixas | Ausência de tokens | Tokens semânticos + codemod + teto no CI | M | Contagem zera nos arquivos tocados; tema escuro sem regressão | Frontend/Design |
| CLIN-QA-213 | P2 | `notification_queue` específica | Fila por caso de uso | Tabela `jobs` genérica + DLQ + tela | M | Job que falha N vezes vai para `dead` e aparece no painel | Backend |
| CLIN-QA-214 | P2 | ICP inexistente (`DigitalSignature.tsx:29-41`) | Não implementado | Provedor de nuvem PAdES | M | PDF valida no Verificador ITI | Backend |
| CLIN-QA-215 | P2 | NFS-e inexistente | Não implementado | Agregador + job | M | Nota emitida e cancelada em homologação | Backend |
| CLIN-QA-216 | P3 | Slugs `auto-migrate`/`init-db` (stubs 410) | Legado | Remover do servidor + gate funções publicadas × repositório | S | Lista publicada = pastas do repositório | DevOps |
| CLIN-QA-217 | P3 | `whatsapp-webhook/index.ts:38` com `!==` | Comparação simples | Comparação timing-safe | S | Teste unitário | Backend |
| CLIN-QA-218 | P3 | HL7/ASTM e SSO inexistentes | Escopo de rede/laboratório | Agente on-prem; SAML por organização | L | Resultado de equipamento simulado chega idempotente; login SAML com IdP de teste | Backend |

## Não realizado

- Não acessei a produção, a VPS nem o Easypanel. O drift de schema, os slugs publicados, a versão do GoTrue e do edge-runtime e as extensões disponíveis (pgmq, pg_net) estão `NÃO VERIFICADOS`.
- Não executei build, testes, `EXPLAIN` nem pgTAP. Os ganhos de desempenho são hipótese.
- Não auditei cada policy nem a cobertura de índices por tabela. Os números são contagens por `grep`.
- Não revisei os outros 45 edge functions nem o `expo-mobile`.
- Não consultei a documentação vigente da ANS (versão TISS em vigor) nem a dos provedores citados. Os provedores aparecem apenas como exemplos.
