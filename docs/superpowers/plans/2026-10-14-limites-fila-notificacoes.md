# Limites contra disparos em massa

**Goal:** Restringir volume por clínica e frequência por número WhatsApp no worker da fila, sem perder mensagens limitadas nem expor o telefone no contador.

### Tasks

- [x] Reusar o contador atômico `checar_rate_limit`, que só aceita chamada service role.
- [x] Limitar a clínica a 50 tentativas por minuto e cada número WhatsApp a um envio por minuto.
- [x] HMAC-SHA-256 do destino com segredo server-side, escopo da clínica e normalização de formatos nacionais/internacionais.
- [x] Reagendar mensagem bloqueada em 60 segundos e restaurar a tentativa consumida pela reserva da fila.
- [x] Mostrar mensagens de limite em resumo seguro na Central de Automações.
- [x] Validar helper, integração do worker, contrato SQL, build e checks.
