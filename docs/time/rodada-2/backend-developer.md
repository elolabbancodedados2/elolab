# Rodada 2: backend-developer

Data: 27/10/2026. Escopo: `supabase/functions/patient-portal`. Nenhuma outra função foi alterada. Sem deploy, sem migration e sem commit.

## O que fiz

### SEC-R1-06: o hash guardado era aceito como token (corrigido)
- Antes: `index.ts:83-104` (versão anterior) buscava pelo hash do valor recebido e, se não achasse, buscava o **valor recebido sem hash** na mesma coluna. Quem lesse a coluna podia enviar o hash como token.
- Agora: a busca está em `acessoPortal.ts:buscarTokenPortal`. Ela faz uma só consulta, pelo `sha256` do valor recebido, e não tem fallback. O `index.ts:77-79` usa essa função.
- Removi o ramo em vez de restringi-lo ao formato "não hash", como a auditoria sugeria. Os tokens legados também eram `encode(gen_random_bytes(32), 'hex')` (`20260303170747_...sql:6`), ou seja, 64 caracteres hexadecimais, e foram convertidos em hash por `20260817310000_hash_tokens_portal_paciente.sql:7-8`. Não existe formato que separe um token legado de um hash guardado, então um fallback restrito não aceitaria nenhum token legado legítimo.
- Também incluí: um token fora do formato `^[0-9a-f]{64}$`, vazio ou que não seja texto é recusado antes de consultar o banco. A busca usa `maybeSingle()`, e qualquer falha responde 401 com a mesma mensagem.

### CLIN-QA-512: dependentes só por `cpf_responsavel` (confirmado e mitigado; o vínculo explícito fica pendente)
- Confirmado pela leitura do código. O único vínculo é o texto `cpf_responsavel` (`20260315212446_...sql:3`), digitado no cadastro e nunca confirmado. A lista de dependentes (versão anterior, `index.ts:940-952`) devolvia qualquer paciente da clínica com aquele texto, de qualquer idade. O isolamento por clínica e a origem do CPF no servidor estavam corretos, como o diretor já tinha conferido.
- Não existe coluna nem tabela de vínculo explícito (`grep -rln "responsavel_paciente_id\|paciente_responsaveis"` em `supabase/migrations` não devolve nada). Para criar esse vínculo é preciso uma migration e uma tela na recepção, que estão fora do meu escopo nesta rodada (ver Pendências).
- Mitigação no servidor, fechada por padrão (`acessoPortal.ts:filtrarDependentesElegiveis`). O vínculo só vale se:
  - o dependente for **menor de 18 anos** e tiver data de nascimento válida. O vínculo expira na maioridade mesmo que ninguém limpe o campo, e um adulto com o CPF do responsável digitado errado deixa de aparecer;
  - o dependente não for o próprio titular e não tiver o mesmo CPF do titular.
- A mesma regra vale para `get_dependentes` e para a troca por `dependente_id` (`index.ts:104-126`, `:141-142`), porque as duas usam a mesma função.

## Arquivos tocados
- `supabase/functions/patient-portal/acessoPortal.ts` (novo)
- `supabase/functions/patient-portal/acessoPortal_test.ts` (novo)
- `supabase/functions/patient-portal/index.ts`: troquei a busca do token e a função de dependentes, e removi as cópias locais de `sha256Hex` e `dependentesDoTitular`. As outras alterações locais desse arquivo, que já existiam antes desta rodada (por exemplo, `solicitar_acesso`), foram preservadas.

## Evidências (comandos executados)
| Comando | Resultado |
|---|---|
| `npx -y deno@2 test --no-lock --config=supabase/functions/deno.json supabase/functions/patient-portal/` | `ok \| 38 passed \| 0 failed`: 10 testes novos, mais os 28 de `remarcacao_test.ts` e `avisoRemarcacao_test.ts` |
| `npx -y deno@2 check --no-lock --config=supabase/functions/deno.json supabase/functions/patient-portal/index.ts supabase/functions/patient-portal/acessoPortal_test.ts` | sem erros |
| `npx -y deno@2 lint --config=supabase/functions/deno.json acessoPortal.ts acessoPortal_test.ts` | `Checked 2 files`, sem problemas |
| `npx eslint supabase/functions/patient-portal/acessoPortal.ts supabase/functions/patient-portal/acessoPortal_test.ts` | `exit 0` |
| `npx eslint supabase/functions/patient-portal/index.ts` | 17 `no-explicit-any`, que já existiam (o `HEAD` tem 6; os outros vêm de alterações locais anteriores a esta rodada). Não adicionei nenhum. |

Testes que cobrem o aceite:
- "SEC-R1-06: o hash guardado enviado como token não autentica": o hash armazenado, enviado como token, devolve `null`, que vira 401. A única consulta usa `sha256(valor recebido)`.
- "SEC-R1-06: nenhuma consulta usa o valor recebido sem hash".
- "CLIN-QA-512: só menores de idade com data válida entram como dependentes": um adulto, alguém que faz 18 anos hoje e alguém sem data de nascimento ficam de fora.
- "CLIN-QA-512: a busca filtra pela clínica do token...": um dependente com o mesmo CPF de responsável em outra clínica não aparece.

`tsc` e `vitest` completos não foram rodados, conforme a regra da rodada. O código alterado é Deno e não entra no `tsconfig.app.json`.

## Riscos e pendências
1. **Consulta 6.1 na VPS: NÃO VERIFICADO.** Se `ativos_fora_do_formato_hash > 0`, ainda existem tokens em texto puro, criados antes de `20260817310000`, e eles deixam de funcionar com este código. Isso falha de forma segura (401), e o paciente recupera o acesso por `solicitar_acesso`. Responsável: rodar `docs/seguranca/consultas-vps-somente-leitura.sql` (seção 6.1) antes do deploy.
2. **Vínculo explícito de dependente (CLIN-QA-512 completo).** Proposta de contrato:
   - `database-engineer`: em `pacientes`, `responsavel_paciente_id uuid` com FK para `pacientes` da mesma clínica (trigger ou check com `clinica_id`), mais `vinculo_confirmado_em timestamptz` e `vinculo_confirmado_por uuid`;
   - `frontend-developer`: confirmação na recepção, com documento conferido;
   - `backend-developer`: trocar o filtro de `dependentesDoTitular` para `responsavel_paciente_id = titular.id AND vinculo_confirmado_em IS NOT NULL`, mantendo a regra de maioridade.
   Até lá, vale a mitigação acima.
3. **Decisão do responsável e do DPO [requer avaliação especializada]:** quem perde acesso com a regra dos 18 anos. Ficam de fora dependentes adultos legítimos (curatela, idosos sob responsabilidade) e cadastros sem data de nascimento. A regra é intencional (fechada por padrão), mas muda o comportamento visível no portal. Se houver exceção, ela deve depender do vínculo explícito do item 2, nunca do CPF digitado.
4. A coluna `cpf_responsavel` continua sem forma normalizada (`cpf_responsavel_digitos`). A busca casa só os formatos `00000000000` e `000.000.000-00`.

## Próximo dono
- `security-engineer`: revisar `acessoPortal.ts` e fechar SEC-R1-06 depois da consulta 6.1.
- `database-engineer` e `product-owner`: vínculo explícito (pendência 2) e a decisão da pendência 3.
- `tech-lead`: incluir na revisão dos diffs da rodada 2.
