# Módulo de teleconsulta

## Auditoria local

- Não há rota, tela, função, tabela ou jornada de teleconsulta no checkout.
- `20261001100000_remove_tipo_telemedicina.sql` remove o tipo de agendamento porque antes ele era apenas um rótulo.
- A clínica agenda horários por profissional, mas não há sessão remota, consentimento nem sala de espera.

## Fluxo e limites

1. Reativar o tipo de agendamento `telemedicina`.
2. Admin ou médico responsável cria sessão a partir de um agendamento futuro/recente da própria clínica.
3. O servidor gera link convidado com token aleatório de uso como credencial; só persiste SHA-256, clínica, agendamento, responsável e expiração.
4. Convidado abre link sem conta, aceita consentimento explícito e aguarda o profissional. A sala revela apenas estado da sessão, sem nome/dados do paciente.
5. Profissional autenticado inicia/admite a chamada; áudio e vídeo seguem por WebRTC ponto a ponto. A aplicação não grava nem armazena mídia.
6. SDP/ICE trafegam pela Edge Function com limite de tamanho, autorização por participante e expurgo curto; eventos de entrada, saída, reconexão, consentimento e encerramento não carregam texto clínico.
7. A sessão expira no horário calculado do agendamento e pode ser encerrada pelo profissional. O link em fragmento é removido do histórico do navegador após leitura.

## Segurança e validação

- Tabelas sem grants diretos a `anon`/`authenticated`; leitura/escrita só pela Edge Function com service role.
- Token convidado jamais retorna em consultas/histórico; resposta sem token usa mensagem genérica para IDs inválidos/expirados.
- Consultas e sessões são sempre vinculadas à clínica, agendamento e profissional autenticado.
- Limitar polling/sinais, remover sinais antigos, não persistir gravações, mensagens ou dados de prontuário.
- Excluir sinais após três minutos e sessões após 30 dias do vencimento; nunca conservar o token puro.
- Validar contratos da migration, lógica de token/sinais, isolamento de ações, fluxo de interface e negociação WebRTC no Chromium com dispositivos sintéticos.

## Validação local

- Contrato da migration: Vitest, 3/3.
- Token/hash, cálculo de expiração e allowlist/tamanho de sinais: Deno, 3/3.
- Edge Function: `deno check` aprovado.
- Fluxo no Chromium: profissional e convidado em contextos independentes; consentimento bilateral, vídeo WebRTC conectado e reconexão com segunda negociação offer/answer aprovados com mídia sintética.
- TypeScript, build, checks de permissões/colunas/falhas/acessibilidade e parse SQL (13 instruções) aprovados.
- ESLint sem erros; os avisos `any` são preexistentes nos componentes da agenda.

## Status

Módulo implementado e validado localmente; nenhuma migration ou função foi aplicada ao Supabase remoto.
