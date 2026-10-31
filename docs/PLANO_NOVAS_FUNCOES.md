# Plano de novas funções do app

Base: protótipo aprovado em 30/10/2026 (https://claude.ai/artifact/PyRiAzWxUBZSd9cidqLdEM) e comparação com o Feegow.
Levantamento feito em 31/10/2026 contra `supabase/migrations` e `src/`.

Regra: tudo que precisa de tabela, coluna ou função nova no banco só entra depois de aprovação do responsável,
com migration revisada e testada em ambiente local. Nada aqui altera o módulo financeiro de pacientes
(`pagamentos_mercadopago`, `lancamentos`).

## O que já existe e só precisa de tela melhor (sem banco)

| Módulo | Situação hoje | O que falta na tela |
| --- | --- | --- |
| Recepção | Fluxo em colunas, lista e Linha do tempo com a hora atual; painel do paciente à direita | Nada pendente na tela |
| Agenda | Dia, semana, mês, painel de novo agendamento e atalho de bloqueio (gestão de bloqueios já existia) | Encaixe direto no painel |
| Pacientes | Fichas, lista e painel lateral com alergias, convênio e contato | Saldo e últimas consultas no painel |
| Atendimento | Prontuário completo, faixa de sinais vitais no topo e atalhos com `/` para receita, exame, atestado e encaminhamento | Puxar os sinais da triagem para a faixa |
| Caixa | Formas de pagamento em botões na venda, recibo automático, abas e ações sem repetição | Nada pendente na tela |
| Convênios e TISS | Lotes, glosas, conciliação | Visão de guias com situação da autorização |
| Indicadores | Painéis por área | Barra de resumo no padrão do protótipo |

## Funções novas (precisam de banco)

Ordem sugerida por valor para a clínica e risco baixo:

1. **Financeiro gerencial: DRE e plano de contas** — entregue em 31/10/2026; **migration pendente de aplicação**
   - Migration `supabase/migrations/20261031120000_plano_contas_dre.sql` (não aplicada): tabelas `plano_contas` (código único por clínica, nome, natureza, grupo da DRE, conta pai, ativo) e `plano_contas_categorias` (liga categoria + natureza de `lancamentos` a uma conta), RLS por clínica (leitura com acesso financeiro, escrita só admin e financeiro), triggers de mesma clínica e RPC `criar_plano_contas_padrao()`. `lancamentos` só é lido.
   - Tela `/financeiro/dre` (menu Financeiro → "DRE e plano de contas"): DRE gerencial em cascata por competência com contas expansíveis, mês anterior, variação, margem sobre a receita líquida, aviso de lançamentos sem conta e exportação CSV; plano de contas em árvore (criar, editar, desativar, plano padrão); vínculo das categorias às contas.
   - Lógica pura e testes em `src/lib/dre.ts`; teste de render em `src/pages/__tests__/DrePlanoContas.test.tsx`.
   - Fica para depois: rateio por centro de custo (`centro_custo`).
2. **Estoque e compras: fornecedores, cotação e pedido** — entregue em 31/10/2026; migration pendente de aplicação.
   - Correção do levantamento: não existia tabela de fornecedores (só o texto livre `estoque.fornecedor`). A tabela `fornecedores` foi criada agora.
   - Migration `20261031121000_compras_cotacoes_pedidos.sql`: `fornecedores`, `cotacoes_compra`, `cotacao_itens`, `cotacao_propostas`, `pedidos_compra`, `pedido_compra_itens`, com RLS por clínica (leitura para admin, enfermagem e financeiro; escrita para admin e enfermagem) e triggers que impedem vínculos entre clínicas.
   - RPCs: `gerar_pedidos_da_cotacao` (menor preço por item, um pedido por fornecedor, fecha a cotação) e `receber_pedido_compra` (entrada no estoque por `registrar_movimentacao_estoque`, uma única vez).
   - Tela `/compras` com abas Cotações, Pedidos e Fornecedores; no Estoque, atalho Compras e `Cotar itens em falta`.
   - Falta: aplicar a migration no ambiente local, prova visual e aprovação do responsável para produção.
3. **Relacionamento: campanhas e NPS**
   - Já existem dados de NPS; falta `campanhas` (público, mensagem com variáveis, canal, agenda de envio) e resultado por campanha.
   - Telas: NPS do período com distribuição, lista de pacientes sem retorno, envio em lote pelo WhatsApp já integrado.
4. **Especialidades**
   - Odontograma (dentes, faces, procedimentos planejados e realizados) e fotos clínicas com marcação de pontos (dermatologia).
   - Tabelas: `odontograma_registros`, `fotos_clinicas` (arquivo no storage com a mesma regra de acesso do prontuário).
5. **Configurações: matriz de permissões**
   - Entregue sem banco: a aba Equipe → Perfis de acesso mostra a matriz perfil × módulo lida da configuração do menu.
   - Pendente (precisa de banco): editar o acesso por perfil ou por pessoa, com tabela própria e trilha de auditoria.

## Como cada função será entregue

1. Migration nova e revisada, aplicada só no ambiente local.
2. Tela e testes unitários; prova visual com a clínica sintética do Playwright.
3. Pedido de aprovação ao responsável antes de aplicar a migration em produção.
4. Deploy pelo fluxo normal: PR, checks obrigatórios, merge e conferência do `version.json`.
