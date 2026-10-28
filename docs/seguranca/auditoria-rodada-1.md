# Auditoria de segurança, rodada 1: acesso e privilégios

Data: 27/10/2026
Autor: `security-engineer`
Base: worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, com alterações locais não commitadas de outras frentes. As linhas citadas valem para esse estado.
Escopo: os P0 de acesso do diagnóstico (CLIN-QA-001 e a parte de MFA do item 10 da visão por função), a causa raiz por privilégio padrão e o roteiro de consultas para confirmar tudo na VPS.
Método: só leitura do repositório. Não acessei a VPS nem nenhum banco, não chamei nenhuma API e não alterei código nem migrations.

Artefato companheiro: `docs/seguranca/consultas-vps-somente-leitura.sql`. As seções 0 a 9 deste documento seguem a numeração do SQL.

---

## 1. Resumo

| ID | P | Achado | Estado no código | Estado na VPS | Correção no repositório |
|---|---|---|---|---|---|
| SEC-R1-01 | **P0** (suspeito) | `link_portal_paciente` pula as checagens de permissão e de clínica quando não há `auth.uid()` | CONFIRMADO | NÃO VERIFICADO (consultas 1.1, 1.3, 1.4) | Escrita por outra frente em `20261028090000`, **não aplicada** |
| SEC-R1-02 | **P0** (suspeito) | `platform_get_clinicas_saude` devolve dados de todas as clínicas sem JWT | CONFIRMADO | NÃO VERIFICADO (1.1, 1.3, 1.4) | Idem, não aplicada |
| SEC-R1-03 | **P0** (causa raiz) | Funções novas herdam `EXECUTE` para anon pelo privilégio padrão; a revogação de 28/07 foi pontual | CONFIRMADO (ausência de `ALTER DEFAULT PRIVILEGES` até 27/10) | NÃO VERIFICADO (2.1, 2.2, 1.2) | Idem, não aplicada |
| SEC-R1-04 | **P0** (plataforma) / P1 (clínica) | MFA exigido só na interface; nenhuma regra no banco lê `aal` | CONFIRMADO | NÃO VERIFICADO (5.1, 5.2) | Nenhuma |
| SEC-R1-05 | P2 | Funções de cron chamáveis por qualquer usuário autenticado e, hoje, possivelmente por anon | CONFIRMADO | NÃO VERIFICADO (1.6) | Parcial: `20261028090000` tira anon, mantém authenticated |
| SEC-R1-06 | P2 | No portal, o hash guardado do token também funciona como token | CONFIRMADO | NÃO VERIFICADO (6.1) | Nenhuma |
| SEC-R1-07 | P2 | Aceite de convite troca a clínica de quem já pertence a outra | CONFIRMADO | — | Nenhuma |
| SEC-R1-08 | P2 | Versão de migration duplicada (`20261010198000`) | CONFIRMADO | NÃO VERIFICADO (9.2) | Nenhuma |

Veredito: os P0 de acesso continuam **abertos**. Para SEC-R1-01 a 03, já existe uma correção escrita localmente por outra frente. Ela está bem encaminhada, mas não foi aplicada, e tem três ressalvas (seção 4). Nenhum dos P0 sai de "suspeito" sem o resultado das consultas.

---

## 2. Como rodar as consultas

1. Abrir `docs/seguranca/consultas-vps-somente-leitura.sql` e conferir o cabeçalho.
2. Rodar com psql, como `postgres`, gravando a saída em arquivo. O comando sugerido está no cabeçalho.
3. O arquivo força `default_transaction_read_only = on`, e cada seção abre `BEGIN TRANSACTION READ ONLY`. Nenhuma instrução escreve. Conferido com `grep -n -i -E "^\s*(insert|update|delete|create|drop|alter|grant|revoke|truncate|call|copy|do)\b"`, que não devolveu nenhuma linha (exit 1).
4. As consultas devolvem só nomes de objetos, ACLs e contagens: nenhum dado de paciente, e-mail, token ou texto de job do pg_cron. Mesmo assim, revise a saída antes de anexá-la.
5. Anexar a saída em `docs/seguranca/resultado-vps-AAAA-MM-DD.txt` e avisar o `security-engineer` e o `dba`.

**Limitação:** o SQL **não foi executado** em nenhum banco. Não há psql nem Postgres local nesta máquina (`which psql postgres`: nenhum dos dois), e Docker não foi iniciado. A sintaxe foi revisada manualmente. Se alguma consulta der erro de sintaxe, o `ON_ERROR_STOP=0` deixa as outras seguirem. O erro deve ser reportado para correção.

---

## 3. O que cada resultado significa

### 0. Contexto

| Consulta | Esperado | Se vier diferente |
|---|---|---|
| 0 | `somente_leitura = on`; `papel = postgres` | Se não for `on`, pare e confira a sessão. Com outro papel, as seções 5, 8 e 9 podem falhar por permissão |
| 0.1 | `anon` e `authenticated` com `rolbypassrls = false` e `rolsuper = false`. `service_role` com `rolbypassrls = true` é o normal do Supabase | `anon` ou `authenticated` com bypass: **P0 imediato**, porque o RLS inteiro deixa de valer |
| 0.2 | `rolconfig` pode vir nulo, quando os schemas expostos ficam na variável de ambiente do PostgREST | Se listar schemas além de `public`, `storage` e `graphql_public`, repetir as seções 1 e 3 para eles |

### 1. Funções executáveis por anon

| Consulta | Esperado (seguro) | Resultado que confirma o achado | Ação |
|---|---|---|---|
| 1.1 | Só as 4 funções da allowlist com `security_definer = true`. Funções `SECURITY INVOKER` podem aparecer: elas obedecem ao RLS, mas vale revisar | Qualquer `security_definer = true` com `na_allowlist = false` e `de_extensao = false` | Lista de trabalho do DBA. Cada linha é uma função que a anon key alcança via `/rest/v1/rpc` com os privilégios do dono |
| 1.2 | `definer_anon_fora_allowlist = 0` | Valor maior que 0 | É o número do aceite de CLIN-QA-001. Guardar o valor de antes da correção (a reversão de `20261028090000` depende dele) |
| 1.3 | `link_portal_paciente` e `platform_get_clinicas_saude` com `anon_executa = false`; a ACL sem `anon=X` | `anon_executa = true` em qualquer uma das duas | **SEC-R1-01/02 confirmados como P0.** Acionar o responsável para decidir a aplicação da correção. Se uma função listada no SQL não aparecer, ela não existe na VPS (drift: ver seção 9) |
| 1.4 | `versao_inferida` coerente com a última migration do repositório | Versão anterior | Se `link_portal_paciente` vier como `20260817310000`, a VPS roda a versão sem nenhuma checagem de clínica, nem para usuário logado: o P0 vale também para authenticated de outra clínica |
| 1.5 | 0 linhas | Alguma linha | Função `SECURITY DEFINER` sem `search_path` fixo: um objeto homônimo em outro schema pode ser resolvido no lugar do esperado. P1 se anon ou authenticated executa, P2 caso contrário |
| 1.6 | Só funções de leitura da própria clínica | `verificar_saude_clinicas_e_alertar`, `watchdog_atendimento_travado`, `enfileirar_lembretes_retorno` e `expirar_ofertas_lista_espera` | SEC-R1-05: qualquer usuário logado, de qualquer clínica, dispara o job, e com ele lembretes em massa e efeitos em todas as clínicas |

### 2. Privilégios padrão

| Consulta | Esperado (seguro) | Resultado que confirma o achado | Ação |
|---|---|---|---|
| 2.1 | Nenhuma linha de tipo `f` com `concede_a_anon = true` | Linha `postgres` (ou `supabase_admin`), schema `public`, tipo `f`, com `anon=X/...` | **SEC-R1-03 confirmado.** Toda função criada depois de 28/07 sem `REVOKE ... FROM anon` explícito nasceu executável por anon. Linhas de tipo `r` com `anon=arwd...` são o padrão do Supabase para tabelas: aí o RLS é a única barreira, e isso reforça a importância da seção 3 |
| 2.2 | Um único dono predominante | Mais de um dono, por exemplo `postgres` e `supabase_admin` | A correção de privilégio padrão precisa cobrir cada dono que cria funções. `20261028090000:337-348` só ajusta `supabase_admin` se o papel aplicador for membro dele |
| 2.3 | Baixo; idealmente 0 fora das funções de extensão | Alto | Funções com ACL nula ou `=X/` são executáveis por PUBLIC e, portanto, por anon. Cruzar com a 1.1 |

### 3. Tabelas, views e RLS

| Consulta | Esperado (seguro) | Resultado de risco | Ação |
|---|---|---|---|
| 3.1 | 0 linhas, ou só tabelas sem dado de tenant e sem privilégio para anon e authenticated | Tabela sem RLS com `anon_select` ou `auth_select = true` | **P0 se a tabela tiver dado de clínica ou paciente:** qualquer usuário lê todas as clínicas. Habilitar o RLS antes de qualquer outra coisa |
| 3.2 | 0 linhas | View sem `security_invoker` que anon ou authenticated leem | A view roda como o dono e ignora o RLS da base. Ex.: `platform_saude_agregada` é declarada com `security_invoker = true` (`20260817210000:136`), e esta consulta confirma se a VPS tem a mesma definição. Se for de tenant: P0 |
| 3.3 | Lista conhecida | Tabela de uso da interface sem policy | Não é vazamento: é negação total. Vira defeito funcional (P1/P2) para o backend |
| 3.4 | Contagens informativas | `anon_insert`, `anon_update` ou `anon_delete` altos | O RLS é a única barreira. Conferir na seção 4 que nenhuma policy para anon ou `public` libera escrita |

### 4. Policies permissivas

| Consulta | Esperado (seguro) | Resultado de risco | Ação |
|---|---|---|---|
| 4.1 | Só `cid10`, `plataforma_estado`, `planos` (`ativo = true`) e as policies de bloqueio `USING (false)` para anon, como em `registros_pendentes` e `employee_invitations` (relatório 03, seção 1) | Qualquer outra linha, sobretudo `qual = 'true'` em tabela com `clinica_id` | **P0 se for tabela de tenant.** Comparar linha a linha com a tabela da seção 1 de `docs/estrategia/funcoes/03-seguranca-qa-sre.md`; diferença = drift de policy |
| 4.2 | 0 linhas, ou policies que dependem só de colunas próprias, como `ativo = true` em catálogo | Policy `TO public` sem referência a auth, clínica ou papel | Policy sem `TO` vale também para anon. Revisar uma a uma. O filtro é heurístico: uma linha aqui exige leitura, não indica vazamento por si só |
| 4.3 | 0 linhas | Policy de INSERT ou UPDATE com `clinica_id IS NULL` | Permite criar linhas órfãs, sem clínica, que ficam invisíveis ou visíveis a todos, conforme a policy de SELECT. P2. Conferir `encaminhamentos` e `coletas_laboratorio` (relatório 03, observação da seção 1) |
| 4.4 | Só buckets de conteúdo público (mídia do painel de TV, logos) | `public = true` em bucket de documento clínico, anexo, foto de paciente ou backup | Arquivo acessível por URL sem login: P0 se for dado de paciente |

### 5. MFA

| Consulta | Esperado hoje | Significado |
|---|---|---|
| 5.1 | 0 linhas | Confirma SEC-R1-04: o banco não distingue sessão AAL1 de AAL2. Depois da correção, deve listar as policies e funções de plataforma e administração |
| 5.2 | — | `com_mfa < usuarios` em `platform_admins ativos` = há admin de plataforma sem fator. Com o MFA só na interface, mesmo quem tem fator é contornável |

### 6. Portal do paciente

| Consulta | Esperado | Significado |
|---|---|---|
| 6.1 `ativos_fora_do_formato_hash` | 0 | Maior que 0 = tokens legados em texto puro ainda válidos, aceitos pelo fallback de `patient-portal/index.ts:96-104`. O fallback não pode ser removido antes de zerar isso |
| 6.1 `ativos_sem_expiracao` | 0 | Token sem validade = credencial permanente |
| 6.1 `sem_clinica` | 0 | Token sem clínica: emitido antes de `20261011010000`, ou por caminho que não preenche a clínica |
| 6.2 | 0 | Maior que 0 = token cuja clínica difere da do paciente: emissão cruzada ou paciente movido de clínica. Investigar antes de concluir |

### 7. Realtime

`rls_ativo = false` em tabela publicada no `supabase_realtime` permite que as mudanças dessa tabela cheguem a assinantes de outras clínicas. Esperado: todas `true`. Qualquer `false` em tabela de tenant: P0.

### 8. pg_cron

A consulta lista `jobname`, `schedule`, `active` e `username`, sem `command`, porque o comando pode conter chave. Serve para confirmar quais funções da 1.6 rodam por cron e com qual papel. Se der erro de schema inexistente, o pg_cron não está instalado: as funções "de cron" então não têm chamador legítimo e só ampliam a superfície de ataque.

### 9. Migrations aplicadas vs repositório

| Consulta | Significado |
|---|---|
| 9.1 NULL | As migrations foram aplicadas fora do CLI, por SQL direto. O histórico não existe, e a comparação só pode ser feita por objeto (seções 1.3, 1.4 e 3.5 do relatório 03). Registrar isso como fato: tira a confiança de qualquer "migration X está aplicada" |
| 9.2 `so_no_repositorio` | Migration escrita e não registrada. As 6 não commitadas de 27/10 devem aparecer aqui (`20261021120000`, `20261021130000`, `20261027120000`, `20261027130000`, `20261028090000`, `20261028100000`). Versões antigas aqui = drift: o banco pode não ter a função ou a policy corrigida |
| 9.2 `so_na_vps` | Mudança aplicada direto na VPS, sem arquivo. Precisa virar migration de baseline (CLIN-QA-318) |
| 9.2 `20261010198000` | O repositório tem dois arquivos com essa versão (SEC-R1-08). Na VPS só cabe um registro por versão: a 9.2 não acusa a falta do segundo, e é preciso conferir por objeto se `checkout_provisionamento_seguro` **e** `mercadopago_oauth_clinicas` estão no banco |
| 9.3 | Resumo. Uma diferença grande entre `registradas_na_vps` e 455 confirma o drift já relatado (125 contra 136 tabelas, `docs/AUDITORIA_MODULOS_QA.md:67`) |

---

## 4. Revisão dos P0 de acesso

### SEC-R1-01 (CLIN-QA-001a): `link_portal_paciente` sem checagem para chamada anônima

- **P0 (suspeito).** Vira P0 confirmado se a consulta 1.3 der `anon_executa = true`.
- **Evidência (código):**
  - Criada em `20260817200000_portal_do_paciente_com_link_no_email.sql:99`, depois da revogação em massa de `20260728041952:5-29`. Recebe só `REVOKE ALL ... FROM PUBLIC` e `GRANT ... TO authenticated` (`:136-137`), sem `REVOKE ... FROM anon`. O mesmo vale para as versões `20260817310000:52-53` e `20261011010000:60-61`.
  - Versão vigente (`20261011010000_portal_paciente_scoped_links.sql`): a checagem de permissão só roda `IF auth.uid() IS NOT NULL` (`:17-21`), e a de clínica também (`:32-35`). Sem usuário, a função localiza o paciente (`:25-28`), invalida os links ativos (`:40-46`), cria um token válido por 1 ano (`:48-54`) e **devolve o link bruto** (`:56`).
  - Chamadores legítimos: `src/pages/Pacientes.tsx:1066` e `src/pages/PortalPacientesClinica.tsx:39` (os dois autenticados) e o trigger de resultado (`20260817200000:171`). As edge functions não usam a RPC: emitem por inserção direta (`supabase/functions/_shared/portalPaciente.ts:29-45`, arquivo não commitado).
- **Classe de problema:** autorização que falha aberta, porque é condicionada à presença de identidade. Junto com o privilégio padrão (SEC-R1-03), quem tem só a chave pública do app e um identificador de paciente obtém uma credencial do portal desse paciente, em qualquer clínica. Efeito colateral: os links legítimos do paciente são invalidados (negação de serviço).
- **Mitigante:** exige conhecer o UUID do paciente. UUID não é segredo: ele circula em URLs da aplicação, em exportações e em logs. Isso não reduz a gravidade, porque o dano é cross-tenant e atinge o prontuário.
- **Correção:** (1) revogar `EXECUTE` de anon; (2) recusar a chamada sem usuário quando ela vier da API. A migration local `20261028090000_revogar_anon_e_privilegios_padrao.sql:73-142`, de outra frente, faz as duas coisas: lê o papel do JWT (`:86-89`), recusa qualquer papel diferente de `service_role` quando não há usuário (`:91-99`) e passa a conferir a clínica também no caminho do trigger com usuário (`:114-118`). Revisada: **adequada**, com as ressalvas da seção 4.5.
- **Teste de aceite:** consulta 1.3 com `anon_executa = false`. Em homologação, chamar a RPC com a chave anon devolve `42501`. Usuário de outra clínica recebe a exceção de permissão. O trigger de resultado continua gerando o link.

### SEC-R1-02 (CLIN-QA-001b): `platform_get_clinicas_saude` sem checagem para chamada anônima

- **P0 (suspeito).** O relatório 03 classificou como P1, mas o consolidado agrupou em CLIN-QA-001 como P0. Mantenho P0 pela rubrica ("vazamento entre clínicas"): a função devolve nome, situação de assinatura, contas a receber vencidas e total de pacientes de **todas** as clínicas. Não expõe dado de paciente, mas expõe dado comercial e financeiro de cada tenant.
- **Evidência:** criada em `20260817210000:36` com `REVOKE FROM PUBLIC` e `GRANT TO authenticated` (`:127-128`), sem revogar anon. A versão vigente, `20260817240000:44`, só exige admin de plataforma `IF auth.uid() IS NOT NULL`. O comentário `:8-11` assume que "cron não é vetor externo", mas a mesma ausência de `auth.uid()` ocorre numa chamada com a chave anon.
- **Classe de problema:** a mesma do SEC-R1-01. O contexto interno (cron) foi identificado por um sinal, a ausência de usuário, que um chamador externo também produz.
- **Correção:** `20261028090000:148-250` distingue "sem JWT" (cron, SQL direto) de "JWT anon" pelo `request.jwt.claims` e revoga anon. Revisada: **adequada**.
- **Teste de aceite:** consulta 1.3; em homologação, chamada anon devolve `42501`; o job `verificar_saude_clinicas_e_alertar` continua funcionando (consulta 8.1 para achá-lo).

### SEC-R1-03 (CLIN-QA-001, causa raiz): privilégio padrão

- **P0 (causa raiz dos dois anteriores e de quaisquer outros ainda não identificados).**
- **Evidência:**
  - `20260728041952_5d6b9a3c-....sql:5-29` revoga anon de todas as `SECURITY DEFINER` existentes **naquele momento**.
  - Até a migration local de 28/10, nenhuma migration tinha `ALTER DEFAULT PRIVILEGES`. Comando: `grep -rli "alter default privileges" supabase/`, que devolveu só `20261028090000_revogar_anon_e_privilegios_padrao.sql`.
  - Contagem: depois de `20260728041952`, há 318 ocorrências de `SECURITY DEFINER` nas migrations, e 61 arquivos com `SECURITY DEFINER` não citam anon em nenhum `REVOKE ... FROM` (laço de `grep` sobre `supabase/migrations`, 27/10). É uma heurística por arquivo: não prova que cada função esteja exposta. A prova é a consulta 1.1.
  - Hipótese (não verificada na VPS): a imagem do Supabase configura privilégio padrão que concede `EXECUTE` a anon em funções novas do schema `public` criadas por `postgres`. A consulta 2.1 confirma ou derruba essa hipótese.
- **Correção:** revogação em massa com allowlist, mais `ALTER DEFAULT PRIVILEGES` para cada papel que cria funções (consulta 2.2). Coberta por `20261028090000:252-348`, com verificação final que aborta a transação se sobrar alguma função fora da allowlist (`:351-380`).
- **Prevenção:** um teste de CI que rode a consulta 1.2 contra o Supabase local e falhe com valor maior que 0 (dono: QA, junto de CLIN-QA-002).

### SEC-R1-04 (CLIN-QA-007 / 304): MFA só na interface

- **P0 para admin de plataforma e impersonação; P1 para administrador e financeiro de clínica.** Pela rubrica, é "falha grave de autenticação": o admin de plataforma enxerga todas as clínicas.
- **Evidência:** `src/pages/Auth.tsx:149-159` decide no cliente se pede o segundo fator. `grep -rn "'aal'\|aal2\|->>'aal" supabase/` não devolveu nada (exit 1): nenhuma policy, função ou edge function confere `aal`. `is_platform_admin()` (`20260522171216_....sql:18-29`) olha só a tabela `platform_admins`.
- **Classe de problema:** controle de autenticação aplicado só na interface. Depois da senha, a sessão AAL1 já é aceita pela API com todos os privilégios do papel. O segundo fator não protege contra senha vazada.
- **Correção (proposta, não escrita):**
  1. `is_platform_admin()` passa a exigir `coalesce(auth.jwt() ->> 'aal', '') = 'aal2'`. Por ser a helper central, isso cobre de uma vez as policies e RPCs de plataforma e de impersonação.
  2. Policy `RESTRICTIVE` com `aal2` nas tabelas financeiras e administrativas, para usuários com papel `admin` ou `financeiro`, quando o MFA for obrigatório para esses perfis. Exige decisão de produto: MFA obrigatório ou opcional por clínica.
  3. Nas edge functions administrativas, conferir `aal` do JWT no servidor.
  4. Política de sessão: definir no GoTrue o tempo de vida do refresh token e o timeout por inatividade para perfis administrativos. NÃO VERIFICADO: a configuração do GoTrue fica na VPS.
- **Teste de aceite:** token AAL1 de um admin de plataforma com fator ativo recebe `42501` nas RPCs `platform_*`. Depois do código TOTP, o token AAL2 funciona. Consulta 5.1 com as novas regras listadas.
- **Dono:** Backend + `security-engineer` (revisão). Decisão de obrigatoriedade: Product Manager.

### 4.5 Revisão da migration local `20261028090000_revogar_anon_e_privilegios_padrao.sql`

Escrita por outra frente (provavelmente o DBA) durante esta rodada. Só li, não editei. Ela **não foi aplicada**.

Pontos fortes:
- Recusa explícita por papel do JWT, em vez de ausência de usuário (`:86-99`, `:174-190`).
- `search_path = ''` com nomes qualificados (`:77`, `:171`).
- Preserva o acesso efetivo de authenticated e service_role por função (`:300-319`), em vez de conceder tudo.
- Verificação final que aborta a transação (`:351-380`) e roteiro de reversão no cabeçalho (`:50-65`).

Ressalvas (antes de aplicar):

1. **Compatibilidade com policies `TO public`.** Se alguma policy que vale para anon (consulta 4.2) chamar uma helper `SECURITY DEFINER` criada depois de 28/07, anon perde o `EXECUTE` dessa helper e o SELECT anônimo passa a falhar com erro, em vez de devolver vazio. Páginas públicas, como planos na landing, checkout e verificação de assinatura, podem quebrar. **Ação:** antes de aplicar, cruzar a 4.1 e a 4.2 com a 1.1 e confirmar que nenhuma policy alcançável por anon chama função fora da allowlist. Risco P1 funcional, não de segurança.
2. **authenticated mantém as funções de cron.** A linha `:333` concede `EXECUTE` a authenticated por padrão em funções futuras, e o laço `:312-315` mantém authenticated nas funções de cron atuais. Resolve anon, mas SEC-R1-05 continua para qualquer usuário logado. **Ação:** migration de seguimento que revogue authenticated das funções da consulta 1.6 sem uso pela interface.
3. **Caminho "sem JWT".** A recusa depende de `request.jwt.claims` estar preenchido em toda chamada via PostgREST. É o comportamento documentado do PostgREST, mas **NÃO VERIFICADO** na versão da VPS. **Ação:** no teste de aceite em homologação, confirmar o `42501` com a chave anon. Se passar, a premissa vale.

Nota menor: `ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (`:328-329`) vale para todos os schemas. Funções futuras de `postgres` em outros schemas também deixarão de ser executáveis por PUBLIC. É o comportamento desejado, mas precisa constar no aviso de mudança.

---

## 5. Achados P2 relacionados

### SEC-R1-05: funções de cron chamáveis pela API
- Evidência: `verificar_saude_clinicas_e_alertar` (`20260817230000:144`), `watchdog_atendimento_travado` (`20260817150000:77`), `enfileirar_lembretes_retorno` (`20260817290000:71`) e `expirar_ofertas_lista_espera` (`20260817293000:67`) recebem só `REVOKE ALL ... FROM PUBLIC`.
- Classe: operação de lote sem chamador autorizado definido. Qualquer chamador com `EXECUTE` dispara efeitos em todas as clínicas, como envio de lembretes em massa.
- Correção: `REVOKE EXECUTE ... FROM anon, authenticated` e `GRANT` só para o papel do cron (consulta 8.1) ou para service_role.
- Aceite: consulta 1.6 sem essas funções.

### SEC-R1-06: o hash guardado vale como token no portal
- Evidência: `supabase/functions/patient-portal/index.ts:83-90` procura pelo hash do token recebido. Se não acha, o fallback `:96-104` procura o **valor recebido sem hash** na mesma coluna. Como a coluna guarda hashes, quem conhece o hash consegue se autenticar enviando o próprio hash como token. Quem lê a coluna: `portal_tokens_select_scoped`, para quem tem `can_manage_data` na mesma clínica (`20260915090000_isola_retornos_por_clinica.sql:99-101`), além de backups e dumps.
- Classe: credencial armazenada utilizável diretamente, o que anula o benefício do hash. Efeitos: um funcionário age no portal como o paciente (remarcação, pré-consulta) sem rastro de que não foi o paciente; um backup vazado vira acesso a todos os portais com token ativo.
- Correção: remover o fallback depois que a consulta 6.1 der `ativos_fora_do_formato_hash = 0`. Se for preciso manter o fallback por um tempo, aceitar só tokens que **não** tenham o formato de hash (`^[0-9a-f]{64}$`). Agrava e substitui CLIN-QA-319 (era P3).
- Aceite: enviar o hash armazenado como token devolve 401.

### SEC-R1-07: aceite de convite troca a clínica do usuário
- Evidência: `20260727230000_security_fixes_c1_c4.sql:294-301` define `clinica_id` do convite no perfil do convidado, liberando a trava com `elolab.allow_clinica_change` (`:297`), sem conferir se o usuário já pertence a outra clínica. `:305` acumula papéis. Grant para anon em `20260729180000:46`, o que é necessário porque o aceite é pré-login. A validação por e-mail (`:259-276`) impede o uso por terceiros.
- Classe: transição de tenant sem confirmação. Um usuário da clínica A que aceita convite da B passa para B, e os papéis antigos podem continuar valendo na nova clínica.
- Correção: recusar quando o perfil já tiver outra `clinica_id`, ou exigir confirmação explícita e limpar os papéis anteriores na mesma transação. CLIN-QA-314.

### SEC-R1-08: versão de migration duplicada
- Evidência: `ls supabase/migrations | grep 20261010198000` devolve `20261010198000_checkout_provisionamento_seguro.sql` e `20261010198000_mercadopago_oauth_clinicas.sql`.
- Risco: o histórico do CLI tem a versão como chave. Na aplicação via CLI, um dos dois arquivos fica sem registro ou a aplicação falha. Uma correção de segurança (`activate_public_registration`, `start_free_trial` revogada em `checkout_provisionamento_seguro:219`) pode não estar no banco sem que ninguém perceba.
- Correção: renomear um dos arquivos para uma versão livre, se ainda não foi aplicado, e conferir por objeto na VPS. Dono: DBA.

---

## 6. Fora deste documento

- **CLIN-QA-003** (paciente errado nos canais públicos) e **CLIN-QA-004** (exclusão LGPD) são P0, mas de identificação e de integridade, não de privilégio. Há trabalho de outras frentes em andamento (`supabase/functions/_shared/identificacaoPaciente.ts` e `supabase/migrations/20261028100000_lgpd_anonimizacao_transacional.sql`, os dois não commitados). Não os revisei nesta rodada. Proponho revisá-los na rodada 2.
- **CLIN-QA-002** (isolamento sem prova no CI): as consultas 3 e 4 dão evidência estática complementar, mas **não** substituem a suíte de isolamento rodando contra um banco. Dono: QA.
- Rate limit, IP forjável, replay de webhook e chave da Evolution (CLIN-QA-311, 312 e 316): sem mudança em relação ao relatório 03.
- LGPD (consentimento, transferência internacional para a OpenAI, guarda de prontuário): **requer avaliação especializada**.

---

## 7. Próximos passos e donos

| Ordem | Ação | Dono | Depende de |
|---|---|---|---|
| 1 | Rodar `consultas-vps-somente-leitura.sql` na VPS e anexar a saída | Responsável | Autorização para acesso somente leitura |
| 2 | Reclassificar SEC-R1-01 a 03 de "suspeito" para confirmado ou derrubado, conforme as consultas 1.1 a 1.4 e 2.1 | `security-engineer` | 1 |
| 3 | Fechar as ressalvas 1 e 2 da seção 4.5 e decidir a aplicação de `20261028090000`, com backup e a saída da 1.1 guardada para a reversão | DBA + responsável | 1, 2 |
| 4 | Escrever a migration de MFA no servidor (SEC-R1-04) e decidir se o MFA é obrigatório por perfil | Backend + PM | — |
| 5 | Remover ou restringir o fallback do portal (SEC-R1-06) | Backend | Consulta 6.1 |
| 6 | Teste de CI com a consulta 1.2 contra o Supabase local | QA | CLIN-QA-002 |
| 7 | Resolver a versão duplicada e reconciliar o drift (seção 9) | DBA / SRE | 1 |
