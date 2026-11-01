# 700 melhorias (01/11/2026)

Segunda rodada, depois das 100 de `docs/MELHORIAS_100_2026-11-01.md`. São 14 listas de 50 itens, do design a funcionalidades novas. O item marcado "| banco" precisa de migration e entra numa onda própria, com backup e teste com ROLLBACK antes de ir para produção.

## Situação

| Lista | Feitos | Pendentes de banco | Fora | Branch |
|---|---|---|---|---|
| 01 Agenda | — | — | — | próximo lote |
| 02 Recepção, fila e triagem | 39 | 9 | 2 | `feat/m700-recepcao` |
| 03 Prontuário | — | — | — | próximo lote |
| 04 Pacientes | — | — | — | próximo lote |
| 05 Exames e laboratório | 41 | 9 | 0 | `feat/m700-exames` |
| 06 Caixa e PDV | 41 (2 em parte) | 9 | 0 | `feat/m700-caixa` |
| 07 Financeiro | — | — | — | próximo lote |
| 08 Convênios e TISS | 44 (4 enxutos) | 6 | 0 | `feat/m700-convenios` |
| 09 Estoque, compras e operação | 44 (1 em parte) | 5 | 1 | `feat/m700-estoque` |
| 10 Equipe e configurações | — | — | — | próximo lote |
| 11 Comunicação | — | — | — | próximo lote |
| 12 Relatórios | — | — | — | próximo lote |
| 13 Design system | — | — | — | próximo lote |
| 14 Funcionalidades novas | — | — | — | por prioridade |

O lote 1 (listas 02, 05, 06, 08 e 09) foi integrado em `feat/m700-lote1`: tsc sem erros, vitest com 442 arquivos e 2158 testes, `check:a11y` OK.

## A conferir antes de confiar

- **Códigos de glosa (08-36):** a lista de 18 motivos foi montada sem a tabela TISS 38 em mãos. Conferir na tabela oficial.
- **TUSS de CA 19-9 e CA 15-3:** ficaram sem código, porque repetiam o do CA 125. Preencher depois de conferir a tabela vigente.
- **Etiqueta de amostra (05-38):** agora traz nome e nascimento do paciente, como pede a identificação do tubo. Antes a etiqueta só tinha código e tubo.
- **Motivo de cancelamento** (coleta, guia e despesa): é gravado em `observacoes` até existir uma coluna própria.

## Pendentes de banco do lote 1

- **Recepção:**
  - grant da RPC de triagem para a recepção;
  - senhas diárias;
  - configuração do painel;
  - contagem de chamadas;
  - tempos da fila;
  - totem;
  - dados da guia no agendamento;
  - limpeza ao finalizar;
  - reavaliação de triagem;
  - desconto máximo.
- **Exames:**
  - responsável técnico e validação pública do laudo;
  - parâmetros por perfil;
  - faixas por sexo e idade;
  - Westgard;
  - eventos do equipamento;
  - link de entrega;
  - anexo e consentimento do portal;
  - validade do link;
  - kits de exames.
- **Caixa:**
  - parcelas no Point;
  - pagamento em lote;
  - Pix com webhook;
  - crédito do paciente;
  - conferência por forma;
  - anexo da sangria;
  - venda com várias formas;
  - médico e operador nos movimentos;
  - filtro de descontos.
- **Convênios:**
  - gerar guias do lote;
  - preços particulares em tabela;
  - regras de repasse;
  - repasses em lote;
  - "meus repasses";
  - validade da carteirinha e carência;
  - tarefas automáticas de prazo.
- **Estoque:**
  - lotes FEFO;
  - motivo codificado;
  - recebimento parcial;
  - checklist por tipo de sala;
  - controle da Portaria 344.
