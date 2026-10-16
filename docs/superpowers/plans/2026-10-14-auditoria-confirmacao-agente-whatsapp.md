# Auditoria do gate humano nas ações do agente WhatsApp

**Goal:** Verificar quando o agente pode agendar consulta e garantir que pré-triagem não seja gravada diretamente no prontuário.

### Findings

- O agente só reserva horário após `SIM` explícito do paciente; interpretações ambíguas não avançam e opções expiram.
- Cancelamento e remarcação são enviados à equipe humana.
- A ferramenta de pré-triagem escreve no contexto da conversa, não nas tabelas do prontuário.
- Não existe fila separada de aprovação interna da clínica nesta etapa.

### Tasks

- [x] Fortalecer testes de contrato sobre confirmação, expiração, handoff e ausência de escrita no prontuário.
- [x] Marcar #85 como comportamento existente auditado, sem alegar implementação de aprovação interna.
