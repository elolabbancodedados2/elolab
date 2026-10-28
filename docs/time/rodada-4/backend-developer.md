# Rodada 4: backend-developer (porte para a base nova)

Data: 27/10/2026. Worktree `time-estabilizacao`, branch `feat/time-estabilizacao` (base `3b5a738c`). Sem deploy, sem migration aplicada, sem commit e sem acesso à VPS.

## Método
- Os blobs de base dos patches (`5f17574d` whatsapp, `7033ce27` public-booking, `18e7832d` patient-portal) existem no repositório. Para `whatsapp-webhook` e `public-booking`, reconstruí o resultado da rodada 3 (base + patch) e fiz um merge de três vias (`git merge-file`) com o arquivo atual, depois de normalizar as quebras de linha.
  - `public-booking`: 0 conflitos.
  - `whatsapp-webhook`: 6 conflitos, resolvidos à mão (ver abaixo).
- O `patient-portal` não foi mesclado. O patch mistura o time com outra frente, então reescrevi só a intenção do time sobre o código atual.

## O que portei

### `supabase/functions/public-booking/index.ts` (CLIN-QA-003, item 7.4b)
- O nascimento passou a ser obrigatório e é normalizado por `normalizarDataNascimento`.
- O vínculo passa por `decidirVinculoPaciente(buscarCandidatosPorCpf(...))`:
  - CPF novo: cria o paciente e agenda;
  - um único cadastro com o nascimento igual: agenda nesse paciente;
  - nascimento divergente ou ausente, ou CPF duplicado: cria a tarefa "Agendamento online pendente" e não agenda.
- A corrida `23505` passa pela mesma regra.
- A resposta é a mesma nos três casos, e a exclamação saiu da mensagem.
- O `cpfValido`, o `mascararCpf` e o `buscarPacientePorCpf` locais foram substituídos pelos de `_shared/identificacaoPaciente.ts`.
- Mantive o que o main trouxe: reserva temporária (`hold` e `release`, `hold_token`) e `failClosed: true` nos limites.
- Atenção: um pedido que vira pendência não consome o `hold`. A reserva expira sozinha (ver Pendências).

### `supabase/functions/whatsapp-webhook/index.ts` (CLIN-QA-003, item 7.4a)
- **Vínculo por telefone desligado.** O main tinha trocado o sufixo com `limit 1` por `findUniquePatientIdByPhone`, uma correspondência exata e única. Desliguei esse vínculo também, conforme a tarefa e a regra "nunca vincular só por telefone": a conversa nasce com `paciente_id: null`. O comentário explica o motivo.
- Nova ferramenta `identificar_paciente` (CPF + nascimento). Ela:
  - grava com `.is('paciente_id', null)`;
  - responde com mensagens neutras, que não dizem qual dado divergiu nem se o CPF existe;
  - encaminha para a equipe o CPF duplicado, o cadastro sem nascimento e mais de 3 tentativas em 24 h.
- **Ajuste novo:** o limite de tentativas usa `failClosed: true`. Se o contador falhar, a conversa vai para a equipe em vez de liberar a conferência.
- Sem vínculo, `consultar_agendamentos_paciente`, `criar_agendamento` e também `cancelar_agendamento`, `reagendar_agendamento` e `confirmar_presenca` (que vieram do main) pedem CPF e nascimento (`MENSAGEM_PEDIR_IDENTIFICACAO`).
- **Listagem:** sai a especialidade. Ficam `id` e `medico_id`, porque o main usa esses ids para cancelar, remarcar e confirmar, e fica o nome do profissional.
- Regra 11 do prompt, no estilo sem acento do prompt atual.

### `supabase/functions/_shared/whatsappAgentPolicy.ts` (fora da lista original, necessário)
- O main passou a filtrar ferramentas por habilidade (`isWhatsAppToolAllowed`). Sem isso, `identificar_paciente` seria removida da lista e recusada na execução.
- Agora ela é liberada quando houver pelo menos uma habilidade que age sobre o paciente: `criar_agendamento`, `consultar_agendamentos_paciente`, `cancelar_agendamento` ou `reagendar_agendamento`.
- `findUniquePatientIdByPhone` continua exportada, mas nada a usa.

### `supabase/functions/patient-portal/index.ts` (SEC-R1-06 e contenção do CLIN-QA-512)
- O token é buscado por `buscarTokenPortal`: uma só consulta pelo hash, sem o fallback pelo valor sem hash, com formato `^[0-9a-f]{64}$`. O `sha256Hex` local foi removido.
- Mantive a regra do main de recusar paciente inativo (`pacientes.ativo === false` → 401). Para isso, incluí `ativo` em `COLUNAS_PERFIL_PORTAL` (`acessoPortal.ts`), e o perfil de dependente também é recusado se estiver inativo.
- A sessão passa por `resolverPacienteDaSessao`, com estas regras:
  - um `dependente_id` diferente do titular recebe 403 `dependent_not_authorized`;
  - `update_contact` exige o titular;
  - `get_dependentes` devolve `[]`.
- Corrigi o texto corrompido `"?ndice de p?gina inv?lido"`.

### Testes (Vitest)
- `whatsappAgentWebhookPolicy.test.ts`: a asserção antiga exigia `findUniquePatientIdByPhone(...)`, que é exatamente o vínculo desligado. Ela foi trocada por duas:
  - a conversa nasce sem paciente e sem `telefone.ilike`;
  - `identificarPaciente` usa `decidirVinculoPaciente`, `normalizarDataNascimento`, `.is('paciente_id', null)` e `failClosed`.
- `whatsappAgentPolicy.test.ts`: novo caso para `identificar_paciente`.

## O que descartei, e por quê
Esses trechos do patch do `patient-portal` são de outra frente (redesign e roadmap), não do time. A rodada 2 do backend registra `solicitar_acesso` como uma alteração anterior, que foi preservada e não é do time. Além disso, o main não tem essas ações nem as telas que as chamam:
- `solicitar_acesso` e o uso de `_shared/portalPaciente.ts`;
- `get_clinica`, `get_pre_consulta` e `submit_pre_consulta`;
- `get_privacidade`, `set_consentimento` e `solicitar_lgpd`;
- `get_atestados`, o PDF de prescrições, `medicosLiberadosOnline` e as fotos assinadas.

`_shared/portalPaciente.ts` continua no disco, sem uso. O teste `src/pages/__tests__/portalPacienteAcesso.test.tsx`, copiado, cobre `solicitar_acesso`, que é do frontend e da outra frente. Não o rodei e não o alterei.

## Arquivos tocados
- `supabase/functions/public-booking/index.ts`
- `supabase/functions/whatsapp-webhook/index.ts`
- `supabase/functions/patient-portal/index.ts`
- `supabase/functions/patient-portal/acessoPortal.ts`: só `COLUNAS_PERFIL_PORTAL`
- `supabase/functions/_shared/whatsappAgentPolicy.ts`
- `src/lib/__tests__/whatsappAgentPolicy.test.ts`
- `src/lib/__tests__/whatsappAgentWebhookPolicy.test.ts`

Os arquivos mantêm CRLF, como estavam.

## Evidências (comandos executados)
| Comando | Resultado |
|---|---|
| `npx -y deno@2 check --no-lock --config=supabase/functions/deno.json` em `public-booking/index.ts`, `whatsapp-webhook/index.ts`, `patient-portal/index.ts` e `patient-portal/acessoPortal_test.ts` | 2 erros, ambos em `whatsapp-webhook` (`alertClient`, TS2322 em `:69` e TS2345 em `:623`). **Já existem no HEAD:** o mesmo check no `git show HEAD:` (arquivo temporário, já apagado) dá os mesmos 2 erros. O código portado não gera nenhum erro. |
| `npx -y deno@2 test --no-lock --config=supabase/functions/deno.json supabase/functions/patient-portal/ supabase/functions/_shared/horarios_test.ts` | `ok \| 47 passed \| 0 failed` |
| `npx vitest run` em `whatsappAgentPolicy`, `whatsappAgentWebhookPolicy`, `whatsappAgentReplies`, `whatsappReceptionTools` e `identificacaoPaciente` | `5 passed (5)`, `42 passed`. Antes de deixar o import em uma linha, 16 falharam: o loader dos testes só remove `import` de uma linha. |
| `npx vitest run` em `portalAppointmentPreparation`, `communicationWebhookAlert`, `portalPatientHistoryContract` e `publicBookingHoldMigration` (leem as funções) | `4 passed`, `10 passed` |
| `npx eslint` nos 7 arquivos tocados | `0 errors`, 68 warnings (`no-explicit-any`). Por arquivo, HEAD → agora: whatsapp 63 → 63, public-booking 5 → 4, patient-portal 8 → 4 |
| `npx -y deno@2 lint` em `acessoPortal.ts` e `whatsappAgentPolicy.ts` | `Checked 2 files`, sem problemas |

`tsc` e `vitest` completos não foram rodados, conforme a regra da rodada.

## Pendências
1. **Decisão do responsável (NÃO VERIFICADO): desligar também o vínculo por telefone exato e único** que o main tinha introduzido. Efeito visível: toda conversa nova de WhatsApp pede CPF e nascimento antes de ações sobre consultas. Se o responsável quiser manter o telefone exato como atalho, a decisão precisa ser registrada, porque contraria a regra "nunca vincular só por telefone".
2. **Erros prévios de `deno check`** em `whatsapp-webhook/index.ts:69` e `:623` (tipagem do `alertClient` e da RPC `registrar_alerta_webhook_comunicacao`). Vêm do HEAD e não são desta rodada. Dono: `backend-developer` ou `tech-lead`.
3. **`public-booking`:** quando o pedido vira pendência, o `hold` do horário não é liberado nem convertido e expira sozinho. Definir com o `product-owner` se a recepção precisa do horário segurado.
4. **CLIN-QA-512:** seguem as pendências da rodada 3. O vínculo explícito depende de modelo do `database-engineer` e de parecer do DPO [requer avaliação especializada].
5. **SEC-R1-06:** antes de publicar, rodar a consulta 6.1 de `docs/seguranca/consultas-vps-somente-leitura.sql`. Tokens legados em texto puro deixam de autenticar, e a falha é segura (401).
6. `_shared/portalPaciente.ts` e `portalPacienteAcesso.test.tsx` estão no disco sem uso no main, porque pertencem a `solicitar_acesso`, da outra frente. A triagem (`codex-triagem` ou `tech-lead`) decide se ficam.
7. `findUniquePatientIdByPhone` ficou sem uso. Ela pode ser removida junto com o seu teste, se a pendência 1 for confirmada.

## Próximo dono
- `security-engineer`: revisar `identificarPaciente` (com `failClosed`), a liberação de `identificar_paciente` na política e o bloco de sessão do portal.
- `qa-engineer` e `tech-lead`: incluir na verificação completa da rodada.
- Responsável: pendências 1 e 5.
