# Rodada 1: sales-customer-success

Data: 27/10/2026.

## O que fiz

Escrevi quatro documentos em `docs/gtm/vendas-cs/`, conferindo no código cada funcionalidade citada:

- `roteiro-demo-30min.md`:
  - roteiros para clínicas (venda em beta) e para laboratório, rede e odonto (só descoberta ou piloto);
  - tabela do que pode e do que não pode ser mostrado, com caminho e linha;
  - perguntas de qualificação;
  - especificação da clínica de demonstração sintética para o `product-owner`;
  - tabela de ensaio, toda em NÃO EXECUTADO.
- `objecoes.md`: TISS, ICP-Brasil, migração, preço e outras objeções, com o fato no código, uma resposta honesta e o que não dizer.
- `implantacao.md`: pré-requisitos, cronograma, checklist (casado com os passos de `OnboardingClinica.tsx`), importação passo a passo com os campos reais do importador, treinamento por perfil ligado às trilhas de `/treinamento` e critério de ativação.
- `saude-do-cliente.md`:
  - fontes de dados existentes (CRM, saúde da plataforma, suporte);
  - nove métricas com faixas;
  - NPS do administrador e playbook de cancelamento;
  - SLA: o que existe, o que não publicar e uma proposta condicionada a 60 dias de medição;
  - itens de feedback para o `product-manager`.

## Arquivos tocados

Criados (nenhum outro arquivo foi alterado):
- `docs/gtm/vendas-cs/roteiro-demo-30min.md`
- `docs/gtm/vendas-cs/objecoes.md`
- `docs/gtm/vendas-cs/implantacao.md`
- `docs/gtm/vendas-cs/saude-do-cliente.md`
- `docs/time/rodada-1/sales-customer-success.md`

## Evidências

Feitas por leitura e busca no código (Read e Grep). Nada foi executado em navegador, banco ou staging.

| Verificação | Resultado |
|---|---|
| Rotas e perfis | `src/App.tsx:208-350`. `/documentacao` é só da plataforma (`:321`). Exames e laboratório exigem o Pro (`:264,268-271`) |
| Planos | `supabase/migrations/20261010230000_planos_pro_ultra_precos_e_recursos.sql:1-22`: Pro R$ 379, Ultra R$ 499 (Pro + `agente_ia`) |
| Importador | `src/components/importacao/ImportadorDePlanilha.tsx` e `src/lib/importacao/campos.ts`: só pacientes e agenda, com prévia, CSV das recusadas e deduplicação por CPF. Não importa prontuário, preços nem convênios |
| Check-in com cobrança | `src/lib/checkinWithBilling.ts:11-14`: o código diz que check-in e cobrança são operações **separadas**. Isso diverge do "atômico" citado no diagnóstico; o roteiro manda não usar essa palavra |
| TISS | `src/pages/FaturamentoConvenios.tsx:335`: "não é arquivo TISS" |
| ICP | `src/components/clinical/DigitalSignature.tsx:29-32,209-212`: assinatura eletrônica simples; a tela remete à Memed |
| Memed | `supabase/functions/memed-prescription/index.ts:46-54`: só homologação. Não há caminho para receita de controle especial |
| Onboarding | `src/pages/OnboardingClinica.tsx:17,27-53`: 5 passos, sendo o WhatsApp opcional |
| CRM e saúde | `src/pages/PlatformCRM.tsx:33-54,103-107`; `src/pages/PlatformSaude.tsx:32-50` |
| SLA de suporte | `supabase/migrations/20260819040000_central_suporte.sql:15`: crítica 1 h, alta 4 h, normal 12 h, baixa 24 h, em horas corridas |
| NPS | Só o do paciente (`src/pages/PortalPaciente.tsx:604-605`) |
| Telemetria | Busca por `telemetr\|usage_event\|eventos_uso\|modulo_uso\|page_view\|track\(` em `src`: só `src/lib/errorTracking.ts` |
| Odonto | Busca por `orçamento\|orcamento\|odontograma` em `src`: 0 ocorrências |
| Demo | `src/pages/DemonstracaoClinica.tsx:7-13`: estática, sem banco |

## Riscos

- **Nenhum bloco da demonstração foi executado.** "Existe no código" não garante que funcione em produção. A tabela de ensaio precisa ser preenchida em staging antes do primeiro uso com cliente.
- **Telas que dependem de P0 abertos ficaram fora da demonstração e da implantação até a correção:**
  - agendamento pelo WhatsApp e link público (CLIN-QA-003);
  - links do portal (CLIN-QA-001);
  - painel de saúde da plataforma, que usa a RPC do CLIN-QA-001.
- **Repasse:** depende de migrations não aplicadas (CLIN-QA-006).
- **Valores não verificados:**
  - limites de usuários de Pro e Ultra;
  - número de dias de teste vigente;
  - formatos de exportação dos concorrentes.
- **SLA:** os prazos de suporte não foram medidos e não devem ser publicados como compromisso.
- **Ativação:** os itens 3 e 4 do critério são acréscimo do CS e precisam ser alinhados com o `growth-marketing`.
- **Requer avaliação especializada:** contrato de beta, DPA, saída do cliente e retenção do prontuário, guarda do prontuário do sistema antigo, TISS e ICP.
- O `objecoes.md` cita `docs/gtm/pricing-proposta.md`, do `growth-marketing`, que está sendo escrito nesta mesma rodada.

## Próximo dono

- **`product-owner`:** história da clínica de demonstração sintética (`roteiro-demo-30min.md`, seção 6).
- **`product-manager`:** atribuir IDs aos oito itens de feedback (`saude-do-cliente.md`, seção 6) e confirmar os limites de Pro e Ultra.
- **`growth-marketing`:**
  - alinhar o critério de ativação;
  - alinhar a resposta de preço com `pricing-proposta.md`.
- **`qa-engineer` ou `business-analyst`:** preencher a tabela de ensaio em staging, depois do CLIN-QA-006.
- **`clinical-quality-director`:** consolidação.
