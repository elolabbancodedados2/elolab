# Migração das tarefas para páginas próprias

Pedido do responsável: concluir os fluxos restantes em sequência, validar cada entrega e publicar. Confirmações curtas de exclusão, cancelamento e descarte permanecem em diálogos. Uma ocorrência de `DialogContent` não significa, isoladamente, uma tarefa pendente: é necessário verificar alcance, uso e responsabilidade.

## Entregas já publicadas

- Agenda: criação e edição.
- Pacientes: cadastro, edição e detalhes.
- Prescrições: criação e conclusão.
- Atestados: criação, consulta e duplicação.
- Encaminhamentos: criação, consulta e contra-referência.
- Exames: solicitação, consulta e resultado.

## Ordem de execução e verificação

1. Laboratórios e fornecedores: listagem, cadastro e edição.
2. Salas e leitos: cadastro e edição, preservando ocupação e concorrência.
3. Tipos de consulta e preços: cadastro, edição e valores por convênio.
4. Lista de espera e retornos: inclusão, edição e continuidade com a agenda.
5. Convênios e tabela de exames: cadastro e configuração comercial.
6. Equipe: médicos, funcionários, usuários e convites.
7. Estoque, tarefas e modelos de documentos/comunicação.
8. Laboratório: pedidos, coleta, guias externas e laudos.
9. Recepção, fila e triagem: triagem, inclusão na fila, encaixe, pagamento e finalização em página própria publicados; outras tarefas da recepção ainda pendentes.
10. Prontuário e componentes clínicos: páginas próprias de adendos (`4ec83bd`), anexos (`5aae8cbc`), consentimentos (`a2c1eb0`), retornos (`ec901d7a`) e criação de evoluções (`2208fb50`) publicadas; outras tarefas documentais permanecem conforme o inventário.
11. Financeiro: criação de contas a pagar (`d9a12f6`), criação de receitas (`f7000e1`), recebimento parcial (`6280cc33`) e estorno de pagamento (`6aef3d6`) publicados em páginas próprias; seguem caixa, conciliação, repasses, faturamento e glosas.
12. Configurações, suporte, LGPD, treinamento e operações de plataforma.

Cada item exige investigar os pontos de entrada e as permissões antes de editar. Componentes incorporados em abas precisam preservar o retorno à aba e os filtros. Formulários de dinheiro, ações clínicas, autenticação e segurança não serão convertidos por substituição global.

## Registro de aceite

O diagnóstico, os arquivos alterados, os testes executados, as capturas efetivamente inspecionadas, as limitações e o identificador publicado ficam em `EVOLUCAO_PAGINAS_OPERACIONAIS.md`. A existência de uma rota, compilação bem-sucedida ou botão que abre uma tela não constitui aceite completo.

Estado atualizado em 30/10/2026: itens 1 a 8 publicados e validados, incluindo laudos (`ddc17f58`). Na etapa 9, triagem (`93e867b9`), check-in (`3b67483d`), encaixe (`1e43732c`), pagamento (`af68e69f`) e finalização do atendimento pelas quatro origens (`49e5056f`) estão publicados; outras tarefas da recepção continuam pendentes de auditoria operacional integrada. Na etapa 10, adendos, anexos, consentimentos, agendamento de retorno (`ec901d7a`) e criação/edição de evoluções (`2208fb50`) têm páginas próprias; demais documentos clínicos permanecem em auditoria. Na etapa 11, a criação de contas a pagar (`d9a12f6`) tem página própria; caixa, conciliação, pagamentos/estornos, repasses, faturamento e glosas continuam pendentes. A etapa 12 também segue pendente. Não há declaração de migração integral do aplicativo.

Orientação adicional do responsável: aplicar a referência Taskify ao visual geral do EloLab. Depois dos modelos clínicos, ajustar a estrutura compartilhada com validação de telas de domínios diferentes, mantendo marca, paleta e funcionalidades. A sequência operacional acima continua registrada e não está concluída.

Atualização de 30/10/2026: na etapa 11, contas a pagar (`d9a12f6c`) e contas a receber (`f7000e1`) agora possuem páginas próprias publicadas. Caixa, conciliação, pagamentos/estornos, repasses, faturamento e glosas seguem pendentes. As demais pendências das etapas 9, 10 e 12 ainda exigem auditoria e execução; não houve conclusão integral do aplicativo.
Atualização de 30/10/2026: recebimento parcial agora também ocorre em página própria (`6280cc33`). A etapa financeira ainda não está concluída: permanecem auditoria/execução de caixa e conciliação, estornos, repasses, faturamento e glosas. As pendências operacionais das etapas 9, 10 e 12 também continuam.
Atualização de 30/10/2026: estorno de pagamento agora também ocorre em página própria (`6aef3d6`), usando a RPC transacional existente e preservando o motivo de auditoria. Ainda faltam caixa, conciliação, repasses, faturamento e glosas; as pendências das etapas 9, 10 e 12 continuam em aberto.
