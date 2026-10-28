# Verificação completa da rodada 2 (tech-lead)

Data: 27/10/2026. Branch `feat/recepcao-painel-dia-melhorias`, árvore de trabalho com as alterações locais das rodadas 1 e 2 e da outra frente (redesign). Nenhum outro agente estava rodando. Sem commit, deploy, migration aplicada ou acesso à VPS.

## 1. Resultado

| Comando | Resultado real | Situação |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.app.json` | exit 0, 0 ocorrências de `error TS`, 27 s | PASSOU |
| `npm run test:run` (`vitest run`) | **214 de 214 arquivos, 1217 de 1217 testes**, nenhum pulado, 267 s | PASSOU |
| `npm run lint` (`eslint .`) | exit 1: **1 erro, 1866 avisos** (1771 `no-explicit-any`, 79 `exhaustive-deps`, 14 `only-export-components`, 2 `no-useless-escape`) | FALHOU, pela outra frente (ver 3.1) |
| `npm run check:colunas` | "nenhuma coluna inexistente", 154 tabelas, 390 arquivos, exit 0 | PASSOU |
| `npm run check:falhas` | 0 casos em 0 arquivos, exit 0 | PASSOU |
| `npm run check:permissoes` | 18 grupos, 72 itens de menu, 71 rotas; "menu e rotas concordam", exit 0. Dois avisos informativos, sem efeito prático | PASSOU |
| `npm run check:a11y` (teto 0) | "controles têm nome acessível", exit 0 | PASSOU |
| `node --test scripts/ci/falhar-se-pulado.test.mjs` | 9 de 9, 0 falhas | PASSOU |
| Testes das rodadas, isolados (10 arquivos: LGPD, anonimização, identificação do paciente, `pacienteDoRegistro`, suítes de segurança e `portalPacienteCancelamento`) | 10 de 10 arquivos, 128 de 128 testes | PASSOU |

Comparação com a rodada 1 (`docs/time/rodada-1/tech-lead.md:69` e `CONSOLIDADO.md:65`): os testes foram de 1131 de 1132 para 1217 de 1217. A falha em `src/pages/__tests__/portalPacienteCancelamento.test.tsx` não se repete. O lint caiu de 1871 para 1866 avisos, e o único erro é o mesmo.

## 2. Arquivos das rodadas 1 e 2: lint comparado com o `HEAD`

Rodei o ESLint (`-f json`) em cada arquivo, na versão atual e na do `HEAD`, num total de 28 arquivos.

- Os 21 arquivos novos (`IdentificacaoPaciente.tsx`, `AnonimizarPacienteDialog.tsx`, `lgpdAnonimizacao.ts`, `pacienteDoRegistro.ts`, `identificacaoPaciente.ts`, `tests/fixtures/*`, `scripts/ci/falhar-se-pulado.mjs`, `scripts/qa/*` e todos os testes novos) têm 0 erro e 0 aviso.
- Nos arquivos alterados, a contagem ficou igual ou caiu:

| Arquivo | Agora | `HEAD` |
|---|---|---|
| `src/lib/lgpdCompliance.ts` | 21 avisos | 21 |
| `src/pages/LgpdPacientes.tsx` | 6 | 6 |
| `src/pages/Prontuarios.tsx` | 55 | 55 |
| `src/pages/Recepcao.tsx` | 43 | 43 |
| `tests/isolamento-entre-clinicas.spec.ts` | 1 | 3 |
| `tests/rls.spec.ts` e `tests/perfis-rbac.spec.ts` | 0 | 0 |

**Conclusão: nenhuma falha de tsc, teste, lint ou `check:*` foi causada pelas rodadas 1 e 2. Não houve correção a fazer.**

## 3. Falhas e pendências de fora das rodadas (não corrigidas)

### 3.1 Erro de lint com efeito funcional: P2, outra frente

- Local: `src/components/agenda/AppointmentDialog.tsx:36`, regra `no-control-regex`.
- Causa, confirmada com `od -c`: a regex `/^retorno\b/i` foi gravada com um caractere de backspace literal (0x08) no lugar de `\b`. Algum script interpretou o escape ao escrever o arquivo.
- Efeito: `isTipoRetorno` só reconhece um nome com backspace no texto, ou seja, nunca devolve verdadeiro. Em `:53`, a nova consulta pode sair com o tipo padrão "Retorno" quando ele for o primeiro tipo ativo da lista. Isso afeta o preço sugerido e a duração, não a segurança.
- O trecho não existe no `HEAD`: vem da alteração local da outra frente (`git diff`, bloco `@@ -31,6 +32,9 @@`).
- É o único arquivo de texto em `src`, `supabase/functions`, `tests` e `scripts` com 0x08, conferido com `grep -rlP "\x08"`.
- Correção proposta, para a outra frente: trocar o byte 0x08 pelos dois caracteres `\b` e incluir um teste de `isTipoRetorno` com "Retorno", "Retorno — DEMONSTRAÇÃO" e "Retornável". Isso bloqueia o lint do CI e o merge.

### 3.2 Versão de migration duplicada: P1 para o CI, já registrado

- O prefixo `20261010198000` continua repetido (`ls supabase/migrations | cut -c1-14 | sort | uniq -d`).
- O job `security-e2e` falha de propósito por isso (TL-R2-05). Tratamento descrito em `docs/arquitetura/banco/versoes-duplicadas.md`, com decisão do responsável.

### 3.3 Não verificado nesta máquina

| Item | Motivo |
|---|---|
| Testes Deno de `supabase/functions/patient-portal` (`acessoPortal_test.ts`, `remarcacao_test.ts`, `avisoRemarcacao_test.ts`) | Deno não está instalado (`deno: command not found`). Rodam no CI ou depois de instalar o Deno |
| Suítes Playwright de segurança (`tests/rls.spec.ts`, `tests/isolamento-entre-clinicas.spec.ts`, `tests/perfis-rbac.spec.ts`) | Exigem Supabase local, com Docker, e o seed de duas clínicas. Ficam para o job `security-e2e`. CLIN-QA-564 (TL-R2-06) indica que a parte de RBAC pela UI deve falhar no job enquanto o Vite subir em modo de teste com chave fixa |
| `npm run build` | Fora do pedido desta tarefa |

## 4. Pendências que seguem abertas, sem mudança nesta verificação

- **TL-R2-01 (P0, CLIN-QA-512):** dependentes do portal, em código não versionado. Ver `docs/time/rodada-2/tech-lead.md:73`.
- **TL-R2-06 (P1, CLIN-QA-564):** variáveis `VITE_SUPABASE_*` no job `security-e2e`.
- **Migrations locais não aplicadas:** `20261028090000_revogar_anon_e_privilegios_padrao.sql` e `20261028100000_lgpd_anonimizacao_transacional.sql`, além de quatro da outra frente. Aplicação só com pedido do responsável.

## 5. Próximo dono

- `clinical-quality-director`: consolidar (TAREFAS-D).
- Outra frente: corrigir 3.1 antes do merge.
- `devops-sre` e `database-engineer`: 3.2 e TL-R2-06.
