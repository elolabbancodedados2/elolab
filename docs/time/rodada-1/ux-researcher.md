# Rodada 1: ux-researcher

Data: 27/10/2026

## O que fiz

- Escrevi o plano de pesquisa e teste de usabilidade para 6 perfis (recepção, médico, financeiro, técnico de laboratório, gestor de rede, dentista), com 5 tarefas cada, critério de sucesso, tempo-limite e erros a observar. Também incluí métricas (sucesso, tempo, cliques, erros críticos, conferência de identidade, SEQ, SUS), critérios de decisão, modelo de termo de consentimento e uma massa de dados sintéticos desenhada para provocar erro de paciente (homônimos, nome social, alergia).
- Para rede e odonto, as tarefas cobrem só o que existe, mais uma entrevista de descoberta: multiunidade e odontograma não existem no código.
- Fiz a avaliação heurística por código do risco de paciente errado em `Recepcao.tsx`, `Prontuarios.tsx` e `CaixaDiario.tsx`, com 8 achados e 8 itens de backlog (CLIN-QA-541 a 548).

## Arquivos tocados

- `docs/ux/pesquisa/plano-rodada-1.md` (novo)
- `docs/time/rodada-1/ux-researcher.md` (novo, este arquivo)

Nenhum arquivo de código foi alterado. Sem commit, deploy, migration ou acesso à VPS.

## Evidências

Somente leitura, por Grep e Read:

- `text-\[(9|10|11)px\]` nas três telas: 81 ocorrências (Prontuários 67, Caixa 11, Recepção 3).
- `nome_social` nas três telas: 11 ocorrências. A faixa do diálogo de edição do prontuário usa só o nome civil (`Prontuarios.tsx:2073`), enquanto a lista, a ficha, a Recepção e o caixa preferem o nome social.
- `orcamento|odontolog|plano_tratamento` em `src`: só `ContasPagar.tsx` e `ContasReceber.tsx`.
- `CLIN-QA-5\d\d` em `docs`: nenhuma ocorrência antes da escrita.
- Principais achados (detalhes e `caminho:linha` no plano, seção 2):
  - O diálogo "Confirmar Pagamento" não mostra o paciente, só a `descricao` (`Recepcao.tsx:1535`). Isso confirma o CLIN-QA-402, antes só relatado.
  - O check-in é feito com um clique, sem confirmação, numa lista animada que se reorganiza por realtime (`Recepcao.tsx:1296-1303`, `:366-383`, `:1194`).
  - A faixa do prontuário em edição não tem data de nascimento nem alergias cadastrais (`Prontuarios.tsx:2071-2077`).
  - A faixa lê `selectedPaciente`, mas a gravação usa `currentProntuario.paciente_id`, sem conferência entre os dois (`Prontuarios.tsx:878`, `:927`, `:1271`). É hipótese, NÃO VERIFICADO se o caminho é alcançável.
  - Uma venda de exame no caixa grava no prontuário com nome e CPF em 10 px, sem data de nascimento e sem resumo antes de finalizar (`CaixaDiario.tsx:1888-1893`, `:1909-1912`, `:1956-1960`).

## Riscos

- Nenhuma observação visual nem teste com usuário. Os efeitos no usuário são hipóteses.
- A pesquisa depende de um ambiente de homologação, que não existe (CLIN-QA-006). Não deve ser feita em produção.
- Termo de consentimento e política de nome social: requer avaliação especializada (DPO).
- Os IDs 541–548 podem colidir com os de outros agentes da rodada, porque não há reserva de faixa. O dono do backlog pode renumerar.
- O CLIN-QA-545, se reproduzido, é P0 (mostra um paciente e grava em outro).

## Próximo dono

- **QA:** teste do CLIN-QA-545 e seed sintético (seção 1.4 do plano).
- **Tech Lead + SRE:** ambiente de homologação (pré-requisito R1).
- **DPO:** termo de consentimento e nome social.
- **product-designer:** soluções para 541–544, 546 e 547, a partir do `PatientIdentityBar`.
- **ux-researcher:** recrutar a onda 1 (5 recepcionistas, 5 médicos) quando os pré-requisitos R1–R4 estiverem prontos.
