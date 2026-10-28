# CLIN-QA-536: A equipe vincula e desvincula a conversa do WhatsApp a um paciente

| Campo | Valor |
|---|---|
| Item de origem | Lacuna L-ID-02 do business-analyst (`docs/produto/processos/identificacao-paciente-canais-publicos.md:195`); apoio à decisão C5 (CLIN-QA-507) |
| Gravidade | P1 |
| Impacto | Clínico. Sem a tela, a equipe não corrige um vínculo errado nem vincula quem não consegue se identificar pelo bot |
| Perfil | Recepção |
| Esforço | M |
| Dono sugerido | `frontend-developer` + `backend-developer`; revisão do `security-engineer` |
| Dependências | 505; decisão C5 do responsável para as conversas herdadas |
| Status | Aberto (27/10, criada na rodada 2) |

## Contexto
Depois da 505, a conversa nasce sem paciente e só o bot vincula, por CPF e nascimento. Não existe tela para a equipe vincular, conferir ou desfazer o vínculo.

## Evidência
- Nenhum `paciente_id` em `src/components/whatsapp/useWhatsAppMutations.ts` (grep do PO em 27/10, sem ocorrência).
- Conversas herdadas respondem "já confirmado" (`supabase/functions/whatsapp-webhook/index.ts:1115-1117`, auditoria da rodada 2).

## Critérios de aceite
- **CA1 (caminho principal).** Dada uma conversa sem paciente, quando a recepção escolhe o paciente com nome completo e data de nascimento à vista e confirma, então a conversa fica vinculada, com usuário e data registrados.
- **CA2 (desvincular).** Dada uma conversa vinculada, quando a recepção desfaz o vínculo, então o bot volta a pedir identificação e o histórico registra quem desfez.
- **CA3 (erro).** Dado um paciente que já foi removido ou anonimizado, quando a recepção tenta vincular, então aparece erro traduzido e nada muda.
- **CA4 (permissão negada).** Dado um perfil sem acesso ao WhatsApp da clínica, quando tenta vincular, então é negado na tela e no banco.
- **CA5 (outra clínica).** Dado um paciente da clínica B, quando a recepção da A tenta vinculá-lo a uma conversa da A, então é recusado.

## Definição de pronto
DoD comum, mais: cabeçalho de identificação (CLIN-QA-524) no diálogo de vínculo; teste de duas clínicas para CA5.
