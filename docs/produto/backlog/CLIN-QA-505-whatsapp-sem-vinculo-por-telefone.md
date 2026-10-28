# CLIN-QA-505: WhatsApp não vincula paciente pelo telefone e exige CPF e nascimento antes de qualquer ação

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-003 (103, 310), caso (b) |
| Gravidade | P0 |
| Impacto | Clínico. O bot podia revelar dados e marcar consulta em nome de outro paciente com o mesmo final de telefone |
| Perfil | Paciente no WhatsApp; recepção (atendimento humano) |
| Esforço | M |
| Dono sugerido | `backend-developer`; `qa-engineer` |
| Dependências | Nenhuma de banco. Decisão sobre conversas antigas na CLIN-QA-507 |
| Status | Feito localmente (27/10, após a rodada 2) |

## Contexto
A conversa nova era ligada ao primeiro paciente cujo telefone continha os últimos 8 ou 9 dígitos (`ilike` + `limit 1`, sem ordenação). Daí em diante, consultar e marcar agiam sobre esse paciente.

## Evidência
- Diagnóstico D.1 #6: `whatsapp-webhook/index.ts:173-179,886-890,993` no estado auditado.
- Worktree: `whatsapp-webhook/index.ts:177-180` (comentário "A conversa nasce sem paciente"). Não validado por teste executado.

## Proposta
Conversa nova sem `paciente_id`. Ferramenta `identificar_paciente(cpf, data_nascimento)` que vincula só com exatamente um paciente da clínica com o CPF e o mesmo nascimento. Resposta neutra em qualquer falha; 3 tentativas em 24 h; depois, atendimento humano.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um paciente da clínica A com CPF X e nascimento D, quando ele informa X e D no WhatsApp da clínica A, então a conversa é vinculada a ele e o bot passa a consultar e marcar em nome dele.
- **CA2 (mesmo final de telefone).** Dados dois pacientes da clínica A cujos telefones terminam nos mesmos 8 dígitos, quando chega mensagem do número do segundo, então a conversa nasce sem paciente e, ao pedir "meus agendamentos", o bot pede CPF e nascimento e não revela nada.
- **CA3 (ação sem identificação).** Dada uma conversa sem vínculo, quando o paciente pede para marcar, remarcar ou cancelar, então nada é criado ou alterado e o bot pede CPF e nascimento.
- **CA4 (dados divergentes).** Dado CPF existente com nascimento errado, CPF inexistente, CPF duplicado ou cadastro sem nascimento, quando o paciente se identifica, então a resposta é a mesma mensagem neutra e nada é vinculado.
- **CA5 (permissão negada por tentativas).** Dadas 3 tentativas falhas em 24 h na mesma conversa, quando chega a quarta, então a conversa vai para `aguardando_humano` e o bot não tenta identificar de novo.
- **CA6 (outra clínica).** Dado o CPF X e o nascimento D de um paciente cadastrado só na clínica B, quando informados no WhatsApp da clínica A, então nada é vinculado e nenhum dado da B é lido.
- **CA7 (erro).** Dada uma falha do banco ou do provedor de IA durante a identificação, quando ela ocorre, então nada é vinculado e o paciente recebe mensagem formal pedindo para tentar mais tarde ou aguardar atendimento.
- **CA8 (privacidade, requer avaliação especializada).** O registro de log não contém CPF nem nascimento. CPF e nascimento enviados ao provedor de IA ficam registrados como risco para o DPO (transferência internacional).

## Definição de pronto
DoD comum, mais: testes do helper de decisão; roteiro do QA (ESTAB-7D, passos 6 a 8) executado em homologação com números e pacientes sintéticos, com evidência anexada.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **testado localmente (E2)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- `supabase/functions/whatsapp-webhook/index.ts:189`: a conversa nasce com `paciente_id: null`; o vínculo pelo final do telefone saiu (diretor, rodada 1; segurança, rodada 2).
- A segurança confirmou na rodada 2 a cota de 3 tentativas por dia por número (`:1128-1133`) e o vínculo protegido contra corrida (`:1156-1165`). Achados: 576 (P3, é o 561 do QA: mensagens diferentes revelam que o CPF existe, `:1145-1152`) e 577 (P2: CPF mais nascimento é conhecimento, não posse).
- `deno check`: NÃO VERIFICADO.

### O que falta
- Corrigir 576 (mesma resposta em todos os casos).
- Publicação, homologação e a decisão C5 (507).

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
