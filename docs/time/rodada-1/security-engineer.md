# Rodada 1: security-engineer

Data: 27/10/2026

## O que fiz
- Escrevi um roteiro de consultas **somente leitura** para o responsável rodar na VPS. Ele cobre: funções executáveis por anon (`has_function_privilege`), versão viva das funções do P0, `SECURITY DEFINER` sem `search_path`, privilégios padrão (`pg_default_acl`), tabelas sem RLS, views sem `security_invoker`, policies permissivas e `TO public`, buckets públicos, cobertura de MFA, tokens do portal, Realtime, pg_cron (sem o texto dos comandos) e migrations aplicadas contra as do repositório (lista de 456 arquivos embutida).
- Revisei os P0 de acesso (CLIN-QA-001 e o MFA do item 10) com evidência `caminho:linha`, classe de problema, correção e teste de aceite, além de uma tabela que explica o que significa cada resultado das consultas.
- Revisei, sem editar, a migration local `20261028090000_revogar_anon_e_privilegios_padrao.sql`, escrita por outra frente durante a rodada: adequada, com 3 ressalvas antes de aplicar.
- Achei dois problemas novos: o hash guardado do token do portal também funciona como token, por causa do fallback legado (SEC-R1-06, P2, que agrava CLIN-QA-319), e há uma versão de migration duplicada, `20261010198000` (SEC-R1-08).

## Arquivos tocados
- `docs/seguranca/consultas-vps-somente-leitura.sql` (novo)
- `docs/seguranca/auditoria-rodada-1.md` (novo)
- `docs/time/rodada-1/security-engineer.md` (este)

Nenhum código, migration ou configuração foi alterado.

## Evidências (comandos reais)
- `grep -rli "alter default privileges" supabase/` → só `20261028090000_revogar_anon_e_privilegios_padrao.sql`, que não está commitada nem aplicada.
- `grep -rn "'aal'\|aal2\|->>'aal" supabase/` → nada, exit 1: nenhuma regra de servidor lê o nível de MFA.
- Um laço de `grep` sobre as migrations posteriores a `20260728041952` encontrou 318 ocorrências de `SECURITY DEFINER` e 61 arquivos com `SECURITY DEFINER` sem `REVOKE ... FROM anon`. É uma heurística, não uma prova de exposição.
- `ls supabase/migrations | grep 20261010198000` → dois arquivos com a mesma versão.
- Varredura de instruções de escrita no SQL (`insert|update|delete|create|drop|alter|grant|revoke|truncate|call|copy|do` no início de linha) → nenhuma, exit 1. São 11 blocos `BEGIN TRANSACTION READ ONLY` e 11 `COMMIT`.
- Linhas conferidas: `20261011010000:17-21,32-35,56,60-61`; `20260817240000:44`; `20260817210000:127-128,136`; `20260728041952:5-29`; `patient-portal/index.ts:83-104`; `20260915090000:99-101`; `src/pages/Auth.tsx:149-159`; `20260727230000:294-305`.
- **NÃO TESTADO:** o SQL não foi executado. Não há psql nem Postgres local (`which psql postgres` não achou nenhum), e Docker não foi iniciado. A sintaxe foi revisada manualmente.

## Riscos
- Os P0 SEC-R1-01, 02 e 03 continuam abertos e "suspeitos" até a VPS ser consultada. Se a consulta 1.3 der `anon_executa = true`, a chave pública do app basta para emitir um link de portal de qualquer paciente, de qualquer clínica.
- Ao aplicar `20261028090000`: (1) policies `TO public` que chamam helpers revogadas podem quebrar páginas anônimas (cruzar as consultas 4.1 e 4.2 com a 1.1 antes); (2) as funções de cron continuam abertas para authenticated; (3) a recusa depende de `request.jwt.claims` estar preenchido na versão do PostgREST da VPS.
- A lista de migrations no SQL é um retrato de 27/10. Outras frentes continuam criando migrations, então convém gerar a lista de novo antes de rodar.
- MFA (SEC-R1-04) sem correção escrita.

## Próximo dono
1. **Responsável:** rodar `docs/seguranca/consultas-vps-somente-leitura.sql` na VPS (psql, papel `postgres`) e anexar a saída.
2. **DBA:** resolver as ressalvas da seção 4.5 da auditoria e a versão duplicada; depois, o responsável decide a aplicação de `20261028090000`.
3. **Backend:** MFA no servidor (`aal2` em `is_platform_admin` e nas policies administrativas) e remoção do fallback do portal.
4. **QA:** teste de CI com a consulta 1.2 (anon fora da allowlist = 0).
5. **security-engineer, rodada 2:** reclassificar os P0 com a saída da VPS e revisar CLIN-QA-003 e 004, que estão em andamento por outras frentes.
