# Plano de novas funções do app

Base: protótipo aprovado em 30/10/2026 (https://claude.ai/artifact/PyRiAzWxUBZSd9cidqLdEM) e comparação com o Feegow.
Levantamento feito em 31/10/2026 contra `supabase/migrations` e `src/`.

Regra: tudo que precisa de tabela, coluna ou função nova no banco só entra depois de aprovação do responsável,
com migration revisada e testada em ambiente local. Nada aqui altera o módulo financeiro de pacientes
(`pagamentos_mercadopago`, `lancamentos`).

## O que já existe e só precisa de tela melhor (sem banco)

| Módulo | Situação hoje | O que falta na tela |
| --- | --- | --- |
| Recepção | Fluxo em colunas e lista | Modo "Linha do tempo" e painel do paciente à direita igual ao protótipo |
| Agenda | Dia, semana, mês, painel de novo agendamento e atalho de bloqueio (gestão de bloqueios já existia) | Encaixe direto no painel |
| Pacientes | Fichas, lista e painel lateral com alergias, convênio e contato | Saldo e últimas consultas no painel |
| Atendimento | Prontuário completo | Sinais vitais em faixa no topo, comandos com `/` para receita, exame e atestado |
| Caixa | Novo visual publicado | Formas de pagamento em botões e recibo automático no painel |
| Convênios e TISS | Lotes, glosas, conciliação | Visão de guias com situação da autorização |
| Indicadores | Painéis por área | Barra de resumo no padrão do protótipo |

## Funções novas (precisam de banco)

Ordem sugerida por valor para a clínica e risco baixo:

1. **Financeiro gerencial: DRE e plano de contas**
   - Tabelas: `plano_contas` (código, nome, tipo, pai), vínculo opcional da categoria de despesa a uma conta.
   - Telas: DRE por competência com níveis, comparação com mês anterior, regras de rateio por centro de custo (já existe `centro_custo`).
2. **Estoque e compras: cotação e pedido**
   - Tabelas: `cotacoes_compra`, `cotacao_itens`, `pedidos_compra`, usando `fornecedores` que já existe.
   - Telas: comparação de preços por fornecedor com o melhor destacado, pedido gerado a partir da cotação, entrada no estoque ao receber.
3. **Relacionamento: campanhas e NPS**
   - Já existem dados de NPS; falta `campanhas` (público, mensagem com variáveis, canal, agenda de envio) e resultado por campanha.
   - Telas: NPS do período com distribuição, lista de pacientes sem retorno, envio em lote pelo WhatsApp já integrado.
4. **Especialidades**
   - Odontograma (dentes, faces, procedimentos planejados e realizados) e fotos clínicas com marcação de pontos (dermatologia).
   - Tabelas: `odontograma_registros`, `fotos_clinicas` (arquivo no storage com a mesma regra de acesso do prontuário).
5. **Configurações: matriz de permissões**
   - Já existem permissões no banco; falta a tela em matriz (perfil × módulo) do protótipo.

## Como cada função será entregue

1. Migration nova e revisada, aplicada só no ambiente local.
2. Tela e testes unitários; prova visual com a clínica sintética do Playwright.
3. Pedido de aprovação ao responsável antes de aplicar a migration em produção.
4. Deploy pelo fluxo normal: PR, checks obrigatórios, merge e conferência do `version.json`.
