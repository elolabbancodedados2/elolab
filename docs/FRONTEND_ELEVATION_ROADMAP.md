# EloLab frontend: evolução por módulos

## Escopo

Evolução do app usado pelas equipes das clínicas, seguindo a ordem visível no menu principal. O console interno da plataforma fica fora desta sequência. Preservar fluxos, permissões, dados reais e linguagem clínica; não inventar indicadores ou ações sem regra de produto confirmada.

## Critérios por tela

- Fluxo principal e ações relacionadas claros para o perfil que usa a tela.
- Layout legível em celular, tablet e desktop, com navegação por teclado.
- Estados reais de carregamento, erro, vazio, sucesso e ausência de permissão.
- Dados e indicadores com origem e período compreensíveis; sem valores demonstrativos apresentados como reais.
- Testes relevantes, typecheck, build e verificação mecânica de acessibilidade antes de encerrar cada lote.

## Ordem e andamento

1. **Início** — Dashboard e Tarefas. Primeira passada concluída.
   - O Dashboard agora dá à recepção e enfermagem contagens de consultas, fila e atendimentos do dia; ao financeiro, contas a receber e vencidas; os três perfis também veem tarefas abertas. As consultas usam somente contagens/status, respeitam a clínica vinculada e exibem estados de carregamento e erro.
   - Tarefas comunica o filtro selecionado com `aria-pressed`, agrupa os filtros com rótulo acessível e destaca vencimentos com cor de alerta.
   - Validação: 19 testes do conjunto Dashboard/Tarefas, TypeScript, build e detector Impeccable sem achados. O navegador não foi usado para inspeção visual nesta passada.
2. **Atendimento** — Em andamento. Na Agenda, os botões Dia/Semana/Mês agora anunciam a visualização selecionada e formam um grupo rotulado para leitor de tela. O restante das telas do grupo segue na revisão.
3. **Pacientes** — Cadastro e histórico, Convênios, acesso ao portal do paciente.
4. **Clínica** — Prontuários, Prescrições e documentos, Sinais vitais, Exames, Modelos clínicos, Encaminhamentos.
5. **Laboratório** — Painel do laboratório, Mapa de coleta, Guias externas, Laudos.
6. **Financeiro** — Visão financeira, Contas, Caixa e fluxo de caixa, TISS e glosas, Repasses médicos, Preços e serviços, Cobrança de inadimplentes.
7. **Relatórios e indicadores** — Relatórios, Relatórios salvos, Indicadores da clínica, Indicadores de produtividade.
8. **Equipe** — Médicos e funcionários, Convites e acessos.
9. **Estoque e suprimentos** — Estoque e itens com baixo estoque.
10. **Comunicação** — Chat interno, Mensagens e lembretes a pacientes.
11. **Automação e IA** — Automações da clínica, Atendente de IA.
12. **Configurações** — Dados da clínica, Horários, Serviços e preços, Notificações, Integrações, FHIR, Plano e assinatura.
13. **Ajuda** — Treinamento e documentação, Suporte, Acesso assistido.

Uma lacuna funcional que dependa de decisão clínica, financeira, regulatória ou de novos dados será registrada para definição antes de alterar regras ou persistência. A navegação e os perfis são derivados de `src/config/sidebarMenu.ts` e das rotas de `src/App.tsx`.
