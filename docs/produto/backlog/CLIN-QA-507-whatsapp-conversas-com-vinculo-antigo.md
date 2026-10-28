# CLIN-QA-507: Conversas do WhatsApp abertas com vínculo antigo por telefone

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-003; risco remanescente registrado em `docs/time/planos/ESTAB-7D-itens-3-4.md` (item 7.4a) |
| Gravidade | P0 (o paciente errado continua possível nas conversas já abertas) |
| Impacto | Clínico. A correção da CLIN-QA-505 vale só para conversas novas |
| Perfil | Paciente no WhatsApp; recepção |
| Esforço | S |
| Dono sugerido | Decisão do responsável; execução `database-engineer` (script local revisado) |
| Dependências | CLIN-QA-505 publicada; backup (CLIN-QA-509); autorização do responsável para qualquer UPDATE em produção |
| Status | Bloqueado por decisão do responsável (27/10, após a rodada 2) |

## Contexto
Conversas ativas criadas antes da correção podem ter `paciente_id` vindo do vínculo por telefone. Sem coluna de origem do vínculo, não dá para separar esse vínculo de um feito por pessoa.

## Evidência
- `docs/time/planos/ESTAB-7D-itens-3-4.md`, seção 7.4a, "Risco remanescente".
- Estados de conversa ativos em `supabase/functions/whatsapp-webhook/index.ts:172`.

## Proposta (a decidir)
Opção A: expirar todas as conversas abertas no momento da publicação da 505. Opção B: limpar `paciente_id` das conversas ativas. Em ambas, registrar quantas foram afetadas.

## Critérios de aceite
- **CA1 (decisão).** Dada a escolha do responsável entre A e B, quando registrada neste arquivo, então tem data e motivo.
- **CA2 (caminho principal).** Dada uma conversa ativa vinculada antes da correção, quando chega a próxima mensagem depois da execução, então o bot pede CPF e nascimento antes de consultar ou marcar.
- **CA3 (outra clínica).** Dada a execução, quando ela roda, então afeta conversas de todas as clínicas de modo igual e não altera paciente, agendamento nem mensagem de nenhuma clínica, só o vínculo ou o status da conversa.
- **CA4 (atendimento humano preservado).** Dada uma conversa em `em_atendimento_humano`, quando a execução roda, então o atendente não perde o histórico.
- **CA5 (permissão negada).** O script só roda com autorização registrada do responsável, depois de backup, e nunca por usuário de clínica.
- **CA6 (erro).** Dada falha no meio da execução, quando ocorre, então nada fica pela metade (transação única) e a contagem afetada é zero.

## Definição de pronto
DoD comum, mais: script local revisado pelo DBA com contagem antes e depois; evidência da execução anexada (sem dado de paciente).

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- As conversas vinculadas pelo telefone antes da mudança continuam vinculadas, e `identificar_paciente` responde "já confirmado" para elas (`whatsapp-webhook/index.ts:1115-1117`, auditoria da rodada 2).
- Novo item ligado: 536 (tela para a equipe vincular ou desvincular conversa).

### O que falta
- Decisão C5 do responsável: desvincular, encerrar ou exigir nova identificação. Depois, a limpeza pelo database-engineer.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
