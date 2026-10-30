# WhatsApp — criação de sessão em página própria

## Diagnóstico

A criação de uma sessão ficava em um diálogo sobre o workspace do Agente IA. O mesmo formulário era aberto pelo botão “Nova Sessão” e pelo estado vazio. O formulário não ocupava o contexto necessário para explicar a conexão e sua validação de nome divergia da regra já aplicada pela Edge Function: o cliente bloqueava sublinhados e não refletia o limite de 64 caracteres.

## Jornada e integração

O administrador da clínica entra em **Agente de IA → Sessões WhatsApp → Nova Sessão**. A rota `/agente-ia/sessoes/nova` mantém a proteção de perfil e o bloqueio do recurso por plano já existentes.

O formulário valida o nome conforme a Edge Function (`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`). Ao enviar, mantém a ação `create_instance` do serviço `whatsapp-evolution`. A função continua validando a clínica, verificando a unicidade global da instância e configurando Evolution API, QR Code e webhook. O sucesso retorna à lista e atualiza as sessões; o QR e as ações de conexão continuam no cartão da sessão.

Em caso de falha, o nome permanece preenchido e a pessoa recebe orientação para conferir a lista antes de repetir a tentativa. Sair com um nome digitado pede confirmação curta. O retorno após cancelar recupera o foco no acionador de origem; após criar, o foco retorna ao título da lista.

## Implementação

- `src/components/whatsapp/NewWhatsAppSessionPage.tsx`: formulário, validação, estados de erro, instruções de pareamento e proteção do rascunho.
- `src/components/whatsapp/SessionsTab.tsx`: os dois acionadores navegam para a rota nova; QR Code, status e ações das sessões existentes permanecem na lista.
- `src/pages/AgenteIA.tsx`, `src/App.tsx` e `src/config/routeLabels.ts`: roteamento, retorno com foco e label/breadcrumb.
- `tests/whatsapp-session-page.spec.ts`: jornadas sintéticas de falha, cancelamento protegido e conexão criada.

Nenhum payload, contrato de dados, permissão, Edge Function, integração ou migration foi alterado.

## Validação

- Playwright 2/2: erro mantém o nome, nome com sublinhado é aceito, nome iniciado por sublinhado é bloqueado, criação retorna à lista com QR, retorno preserva foco e o rascunho exige descarte explícito.
- Vitest de regressão WhatsApp 9/9.
- TypeScript e ESLint focal passaram.
- Build de produção passou.
- `check:a11y`, `check:permissoes`, `check:falhas` e `check:colunas` passaram.
- Capturas mobile (390 px) e desktop (1440 px), incluindo sessão criada e QR sintético, foram inspecionadas. Sem diálogo de tarefa, sem overflow horizontal e com a ação principal acima da navegação inferior.

## Limites

As respostas de criação e a leitura do QR foram interceptadas no E2E. Nenhuma instância real foi criada nem aparelho conectado; a integração com Evolution API e o pareamento em produção não foram rehomologados nesta entrega.

## Publicação

Pendente de publicação nesta versão do documento.
