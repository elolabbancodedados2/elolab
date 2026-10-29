# EloLab — páginas operacionais

## Direção e publicação

Em 29/10/2026, o responsável pediu páginas próprias no lugar dos modais de trabalho em vários módulos. Confirmações curtas continuam contextuais. Pediu também deploy ao terminar cada entrega; publicar após validação e conferir a versão servida. Isso não autoriza migrations, mudanças de permissões ou operações financeiras como efeito colateral de um redesign.

Base do plano: `AUDITORIA_COMPLETUDE_MODULOS_2026-10-29.md`. Evolução incremental: agenda → pacientes → prontuário/documentos/exames/laboratório → financeiro → demais cadastros, validando cada fluxo antes de avançar.

## Agenda — primeira entrega

### Diagnóstico

Criar e editar consulta abria um modal de três abas, bloqueando o calendário. Fechar descartava o preenchimento sem confirmação. Não havia URL própria da edição.

### Implementação

- `/agenda/nova` e `/agenda/:appointmentId/editar` passam pelas mesmas permissões da agenda.
- Formulário organizado em paciente e dados da consulta, com observações visíveis. Sem overlay ou etapas artificiais.
- A página de edição consulta o registro novamente, filtrando clínica e profissional quando necessário. Aberturas seguintes não reutilizam indefinidamente dados antigos.
- Voltar preserva data, visão e filtros da agenda; links antigos de notificações, reagendamento e lista de espera continuam encaminhando ao fluxo.
- Validações existentes de conflito, sala, bloqueio, disponibilidade, data/hora, edição concorrente, WhatsApp e cancelamento com motivo preservadas.
- Confirmações de saída sem salvar, horário excepcional e cancelamento permanecem. Falha de salvamento mantém o preenchimento.
- `RouterProvider`/`createBrowserRouter` substituem somente o contêiner de navegação para permitir o bloqueio suportado de navegação. Providers, rotas, autenticação e guardas existentes foram preservados. `UnsavedChangesGuard` protege navegação interna e recarga, sem persistir o rascunho em armazenamento local.
- Referência técnica consultada: [useBlocker do React Router](https://reactrouter.com/api/hooks/useBlocker).

### Validação

- TypeScript sem erros; ESLint focal sem erros, com avisos de `any` no código examinado.
- 24 testes unitários focados passaram: payload, conflito, cancelamento, acessibilidade de rota e proteção de acesso.
- Primeira rodada de regressão concluída: 8 cenários Playwright passaram, incluindo novas páginas, layouts 1440/768/390, confirmação de saída/voltar do navegador, falha e sucesso de edição, fluxo anterior de agenda e conflitos.
- Capturas de desktop, tablet e celular efetivamente inspecionadas. Ações no celular ficam acessíveis acima da navegação inferior ao rolar.
- Build de produção local passou.
- Matriz ampliada concluída: 9 cenários Playwright passaram, incluindo a varredura de rotas de clínica, plataforma e aliases em duas larguras, mais as verificações focadas da agenda. A execução levou aproximadamente 4min44s.
- A repetição revelou uma corrida na confirmação de saída: o teste acionava o segundo diálogo antes de terminar o fechamento do primeiro. O teste agora aguarda a remoção real do diálogo; a confirmação também marca explicitamente o descarte antes de continuar a navegação. O cenário passou 5 vezes consecutivas, sem retries, incluindo preservação da busca ao voltar.
- Publicação: em preparação; registrar versão e verificação após o deploy.

### Limites

Dados e mutações dos testes são sintéticos/interceptados. Não houve consulta clínica real criada, cancelada ou modificada. Mudança de formulário não homologa as integrações externas nem substitui testes de isolamento no backend. Os demais módulos ainda aguardam a migração para páginas; não estão incluídos nesta primeira entrega.
