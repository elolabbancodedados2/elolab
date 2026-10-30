# Recepção completa

## Objetivo

Completar o fluxo de recepção conectando funções existentes e acrescentando uma conferência administrativa por consulta, sem duplicar Agenda, Fila, Caixa ou Portal do Paciente.

## Requisitos

- Conferir cadastro, documento com foto e convênio/cartão por agendamento, persistindo os itens marcados, data e usuário responsável.
- Destacar pendências de cadastro disponíveis no sistema: CPF, telefone e dados do cartão do convênio.
- Abrir o fluxo existente de cadastro novo com verificação de duplicidade a partir do encaixe.
- Abrir a geração do link do Portal do Paciente a partir da consulta e mostrar QR para pré-atendimento; não enviar dados automaticamente. O link existente concede acesso amplo ao portal, revoga o link anterior e exige confirmar a identidade do paciente antes do compartilhamento.
- Ajustar prioridade da fila na Recepção usando as categorias já existentes (normal, preferencial, urgente), sem classificação automática por dado clínico.
- Emitir senha impressa estável por item da fila e mostrar a senha no painel de chamadas no lugar do nome do paciente.
- Oferecer contato de reagendamento via WhatsApp para não comparecimentos.
- Abrir a passagem de turno existente a partir da Recepção.
- Criar uma pendência administrativa já vinculada à categoria e ao prazo de hoje, escolhendo responsável no formulário padrão de tarefas e retornando à Recepção ao salvar ou cancelar.
- Respeitar clínica ativa e permissões atuais; não exibir dados clínicos no ticket ou resumo de turno.

## Fora de escopo

- Novo canal de mensagens, integração WhatsApp ou envio automático.
- Duplicar cadastro, prioridade, passagem de turno, agenda, caixa ou fila já existentes.
- Criar um segundo sistema de tarefas ou um registro paralelo de passagem de turno.
- Novos dados clínicos no perfil administrativo.
