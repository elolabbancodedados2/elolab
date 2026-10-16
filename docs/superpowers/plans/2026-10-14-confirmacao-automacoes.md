# Alteração segura de automações

**Goal:** Exigir prévia de impacto e confirmação ao pausar/retomar automação, registrando o autor e evitando sobrescrever alteração concorrente.

### Tasks

- [x] Consultar contagem exata de mensagens pendentes, em envio, incertas ou com erro na clínica ativa.
- [x] Bloquear confirmação se o total não puder ser calculado.
- [x] Exibir o impacto e pedir confirmação explícita.
- [x] Aplicar compare-and-set no estado atual e impedir troca de clínica entre prévia e gravação.
- [x] Registrar autoria e valores anterior/novo em `audit_log`.
- [x] Validar os fluxos positivo e erro com Playwright e checar política/trigger de auditoria existentes.
