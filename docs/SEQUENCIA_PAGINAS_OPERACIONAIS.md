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
10. Prontuário e componentes clínicos: anexos, consentimentos, adendos, documentos e retornos.
11. Financeiro: contas, caixa, conciliação, repasses, faturamento e glosas.
12. Configurações, suporte, LGPD, treinamento e operações de plataforma.

Cada item exige investigar os pontos de entrada e as permissões antes de editar. Componentes incorporados em abas precisam preservar o retorno à aba e os filtros. Formulários de dinheiro, ações clínicas, autenticação e segurança não serão convertidos por substituição global.

## Registro de aceite

O diagnóstico, os arquivos alterados, os testes executados, as capturas efetivamente inspecionadas, as limitações e o identificador publicado ficam em `EVOLUCAO_PAGINAS_OPERACIONAIS.md`. A existência de uma rota, compilação bem-sucedida ou botão que abre uma tela não constitui aceite completo.

Estado em 29/10/2026: itens 1 a 8 publicados e validados, incluindo laudos (`ddc17f58`). Na etapa 9, triagem (`93e867b9`), check-in na fila (`3b67483d`), encaixe (`1e43732c`), pagamento (`af68e69f`) e finalização do atendimento pelas quatro origens estão publicados; outras tarefas da recepção continuam. Itens 10 a 12 seguem pendentes. Não há declaração de migração integral do aplicativo.

Orientação adicional do responsável: aplicar a referência Taskify ao visual geral do EloLab. Depois dos modelos clínicos, ajustar a estrutura compartilhada com validação de telas de domínios diferentes, mantendo marca, paleta e funcionalidades. A sequência operacional acima continua registrada e não está concluída.
