# Proposta de pricing e packaging

Data: 27/10/2026. Autor: `growth-marketing` (rodada 1). Status: proposta para decisão do responsável. Nenhum preço, plano ou trial foi alterado em código, banco ou produção. Itens CLIN-QA-408 (trial) e CLIN-QA-417 (estrutura por porte).

Os valores em R$ desta proposta são **hipóteses de partida para pesquisa e experimento**, não preços decididos. A decisão final é do responsável.

## 1. Estado atual (observado no código)

| Fato | Evidência |
|---|---|
| Dois planos à venda, cobrados por clínica: **Pro R$ 379/mês** (slug `elolab-max`) e **Ultra R$ 499/mês** (slug `elolab-ultra`) | `supabase/migrations/20261010230000_planos_pro_ultra_precos_e_recursos.sql:1-21` |
| A única diferença entre os planos é o recurso `agente_ia` (atendente de IA no WhatsApp). Ou seja, a IA custa hoje R$ 120/mês | mesma migration, `:7` e `:16-18` |
| Trial de **3 dias, com cartão** e autorização da assinatura recorrente | `supabase/migrations/20261010198000_checkout_provisionamento_seguro.sql:222`; `supabase/functions/public-checkout/index.ts:76-78`; `src/pages/LandingPage.tsx:197,603` |
| Trials vencidos são encerrados por job agendado | `supabase/migrations/20261010195000_agendar_expiracao_de_trials.sql:1-20` |
| Limites por plano existem (`max_medicos`, `max_recepcao`, `max_funcionarios_total`, `max_storage_mb`) e são aplicados no convite de equipe | `supabase/migrations/20260522171216_def6af16-0ae1-4b40-bcb5-d409997e411c.sql:85-89`; `supabase/functions/_shared/limitesClinica.ts:146-177`; `src/hooks/usePlanLimits.ts` |
| **Achado:** o `UPDATE` que define os limites usa os slugs `pro`, `max` e `ultra` (`:94-95`), mas os planos à venda têm slugs `elolab-max` e `elolab-ultra` (`20260303170248_*.sql:79,89`). Nenhuma outra migration define limites para eles (`grep -rn "update public.planos"` em 27/10/2026). Pelas migrations, Pro e Ultra ficam com os valores padrão da coluna: **3 médicos, 2 recepcionistas, 10 pessoas no total e 1 GB** | `20260522171216_*.sql:86-89` |
| Limites de consumo por clínica, separados dos planos: 20 usuários, 100.000 tokens de IA e 5.000 notificações por mês (padrão), ajustáveis pelo admin da plataforma | `supabase/migrations/20260819200000_limites_consumo.sql:1-3` |
| A FAQ não informa limites: "Confira os limites vigentes na proposta antes de contratar" | `src/pages/LandingPage.tsx:212-213` |

Os limites efetivos em produção estão **NÃO VERIFICADOS** (o admin pode ter alterado a tabela `planos`). Se o padrão estiver valendo, uma clínica com 4 médicos não consegue contratar o Ultra, e a landing não avisa. Esse risco é comercial (P1, cobrança e expectativa) e passa ao `product-owner` e ao `database-engineer`: confirmar com `select slug, max_medicos, max_recepcao, max_funcionarios_total, max_storage_mb from planos where ativo` no ambiente do responsável.

## 2. Benchmark público (consultado em 27/10/2026)

| Produto | Preço publicado | Unidade | Anual | Trial | Add-ons publicados | Fonte |
|---|---|---|---|---|---|---|
| iClinic | Starter R$ 99, Plus R$ 129, Pro R$ 169, Premium R$ 299/mês | **por profissional de saúde** | 8% de desconto | 5 dias, sem cartão | WhatsApp a partir de R$ 29,90/mês com 85 mensagens; assinatura eletrônica do paciente R$ 14,90/mês por profissional; SMS R$ 0,09–0,10 | https://iclinic.com.br/precos/ |
| Clinicorp | Standard R$ 159,90; Premium R$ 369,90/mês; combos de IA sob consulta | por clínica, usuários ilimitados, 10 GB | trimestral com desconto | **não há**; demonstração com consultor | Implantação obrigatória cobrada no 1º mês (valor não publicado); IA só nos combos | https://www.clinicorp.com/planos |
| Simples Dental | Basic R$ 149,90; Plus R$ 249,90; Pro R$ 349,90 (anual: R$ 137,41, 229,08 e 320,74/mês) | não informado | anunciado "-10%", os valores dão cerca de 8,3% | 7 dias, sem cartão | Secretária IA ("menos de R$ 6/dia"), confirmação por WhatsApp, NFS-e e assinatura eletrônica pagos à parte, sem preço | https://www.simplesdental.com/planos-e-precos |
| Amplimed | sem preço; planos por porte (1–2 profissionais, 3+, operadora) | não informado | — | "começar gratuitamente", termos não claros | complementos de WhatsApp e IA | https://www.amplimed.com.br/planos (consultado pelo `04-ux-gtm.md` na mesma data) |
| Ninsaúde, ProDoctor | sem preço publicado | — | — | — | — | https://www.ninsaude.com/, https://prodoctor.net/ (mesma fonte) |
| Feegow | NÃO VERIFICADO: o site recusou a conexão TLS em 27/10/2026 (duas tentativas) | — | — | — | — | https://feegow.com/planos |

Comparação com o EloLab, por clínica e por mês (só mensalidade, sem add-ons):

| Porte | iClinic Pro (R$ 169 × profissionais) | Clinicorp Standard | EloLab Pro hoje |
|---|---|---|---|
| 1 profissional | R$ 169 | R$ 159,90 | R$ 379 |
| 3 profissionais | R$ 507 | R$ 159,90 | R$ 379 |
| 5 profissionais | R$ 845 | R$ 159,90 | R$ 379, se o limite permitir (ver §1) |

Leituras:

1. **O consultório de 1 ou 2 profissionais paga mais caro no EloLab** do que em qualquer concorrente com preço publicado. Esse público é o que mais compra por autosserviço.
2. Acima de 3 profissionais o EloLab fica abaixo da iClinic, mas o limite padrão de 3 médicos (§1) pode impedir esse cliente de entrar.
3. Atendimento por IA e WhatsApp é vendido como complemento pago em três dos concorrentes. Isso sustenta cobrar a IA à parte, como já fazemos.
4. Os três concorrentes de autosserviço com preço publicado dão de 5 a 7 dias **sem cartão**, ou nenhum trial com venda consultiva. Nosso trial de 3 dias com cartão é o mais restritivo.
5. Concorrentes com TISS e ICP nos planos de entrada (diagnóstico §E) justificam preço por recurso que não temos. Não devemos cobrar como se tivéssemos.

## 3. Princípios

1. Cobrar pelo que existe e passou no smoke (item 30.9 do diagnóstico). Recurso ausente não entra em plano nem em add-on, nem como "em breve".
2. Unidade de valor = **profissional de saúde com agenda**. É o que cresce com o tamanho da clínica e o que o cliente entende. Recepção e administrativo não são cobrados por pessoa, para não inibir o convite da equipe, que faz parte da ativação (`plano-analytics.md` §2).
3. Preço base por clínica com profissionais incluídos, mais valor por profissional adicional. Assim o consultório pequeno paga menos e a clínica média não paga como na iClinic.
4. Limites publicados na página de planos. Nada de "confira na proposta" para autosserviço.
5. Clientes atuais mantêm preço e condições (grandfathering) por pelo menos 12 meses, com aviso por escrito antes de qualquer mudança. Contrato e aviso: requer avaliação especializada.

## 4. Planos propostos

### 4.1 Clínica (autosserviço), cobrança por clínica

| Plano | Profissionais de saúde incluídos | Equipe administrativa | Armazenamento | Hipótese de preço mensal | Racional |
|---|---|---|---|---|---|
| Essencial | até 2 | até 3 | 5 GB | R$ 229 a 279 | Entre Simples Dental Plus e 2× iClinic Plus; resolve a leitura 1 |
| Clínica | até 5 | até 10 | 20 GB | R$ 379 (preço atual do Pro) | Mantém a âncora atual e fica bem abaixo de 5× iClinic |
| Clínica Plus | até 10 | até 25 | 50 GB | R$ 649 a 749 | Clínicas médias; caminho para contrato anual |
| Profissional adicional | — | — | — | R$ 59 a 79 por profissional/mês | Abaixo do iClinic Starter (R$ 99), para não punir crescimento |

Todos os planos com os mesmos módulos que o Pro tem hoje: agenda, recepção com cobrança no check-in, prontuário, caixa, portal do paciente e confirmação de consulta. Não fragmentar módulo clínico entre planos nesta fase: aumenta o suporte e confunde o trial.

Anual: 10% de desconto, pago à vista ou em 12 parcelas no cartão (prática de iClinic e Simples Dental, §2). A forma de cobrança anual depende do que o checkout do Mercado Pago suporta hoje: NÃO VERIFICADO, fica com o `backend-developer`.

### 4.2 Laboratório e clínica com posto de coleta

Não publicar preço. Hoje o laboratório é piloto consultivo, bloqueado para venda ampla por código de barras (CLIN-QA-013), interfaceamento (026) e segregação entre validação e liberação (022) (`posicionamento-por-segmento.md` §4.2).

- **Piloto:** add-on Laboratório sobre o plano Clínica, com preço negociado e escrito, prazo de 90 dias e critério de saída.
- **Depois do 013:** testar duas métricas de cobrança em entrevista (por volume de exames/mês ou por bancada) antes de decidir.

### 4.3 Redes multiunidade e odontologia

Sem plano e sem preço. Não há modelo de unidades (024) nem odontograma (025). Para redes: formulário de interesse (CLIN-QA-412) e discovery (418). Quando abrir, o modelo provável é contrato anual por unidade, implantação paga e SLA, como fazem os concorrentes que atendem clínicas grandes sem publicar preço (§2, leitura de `04-ux-gtm.md`).

## 5. Add-ons

| Add-on | Existe em código? | Proposta | Condição para vender |
|---|---|---|---|
| Atendente de IA no WhatsApp | Sim (`agente_ia`; `supabase/functions/whatsapp-webhook`), com **P0 aberto** CLIN-QA-003 | Substituir o Ultra por um add-on de R$ 120/mês (diferença atual) com franquia mensal e excedente por faixa. A franquia deve ser medida em **conversas**, mais fácil de entender; hoje o sistema mede tokens (`platform_ai_usage`, `20260819200000_limites_consumo.sql:2`). Conversão de tokens em conversas: NÃO VERIFICADO, precisa de dados de uso | Fechar o 003. Medir 30 dias de uso real para definir a franquia |
| Confirmação e lembretes por WhatsApp | Sim (`send-appointment-reminder`, `appointment-confirmation`) | Incluído nos planos até 5.000 notificações/mês (limite que já existe). Não cobrar à parte agora: é a mensagem principal do segmento 4.1 | Confirmar se o custo de envio por mensagem (Meta/BSP) cabe na margem: NÃO VERIFICADO |
| Armazenamento adicional | O limite existe (`max_storage_mb`) | Pacotes de 50 GB, preço a definir pelo custo real da VPS | Confirmar se o limite de armazenamento é aplicado no upload: NÃO VERIFICADO |
| Implantação assistida e migração de dados | Serviço, apoiado em `src/components/importacao/ImportadorDePlanilha.tsx` | Opcional no Essencial e no Clínica; incluída no Clínica Plus anual. Preço fixo por pacote | Playbook em `docs/gtm/vendas-cs/implantacao.md` |
| Laboratório | Sim, em piloto | §4.2 | §4.2 |
| **Não vender:** TISS em XML, NFS-e, Pix do paciente, receita ICP-Brasil, telemedicina | Não existem ou estão fora de escopo (`posicionamento-por-segmento.md` §2) | — | — |

## 6. Trial

Proposta: **14 dias sem cartão** para os planos Clínica, mantendo a opção "contratar agora".

Por quê:
- 3 dias não cobrem uma semana de agenda. A ativação proposta exige equipe, agenda, serviço, agendamento e check-in em até 7 dias (`plano-analytics.md` §2), e o onboarding atual ainda exige WhatsApp conectado (`20261001210000_onboarding_requires_operational_readiness.sql:57-71`).
- Pedir cartão antes de mostrar valor reduz cadastros, e o benchmark de autosserviço não pede (§2, leitura 4).

Riscos e mitigação:
- **Mais cadastros sem intenção e mais carga na VPS:** limitar o trial a 2 profissionais e 1 GB (já é o padrão do slug `trial`, `20260522171216_*.sql:92`) e exigir e-mail confirmado.
- **Uso de IA e notificações por contas de teste:** sem IA no trial; notificações com teto de 200 no período.
- **Menor conversão no fim do trial:** contato humano no dia 2 e no dia 10, e aviso no app nos dias 10, 13 e 14.

Mudança técnica (fora desta tarefa): hoje `public-checkout` recusa trial sem cartão (`supabase/functions/public-checkout/index.ts:76-78`). Exige decisão do responsável e trabalho do `backend-developer`. Sem alteração nesta rodada.

## 7. Experimentos

Pré-requisito comum: camada A do funil (`plano-analytics.md` §3.1 e §7, item 1) em produção, com pelo menos 4 semanas de linha de base. Sem isso nenhum experimento abaixo é legível.

### E1: trial de 14 dias sem cartão contra 3 dias com cartão

| Campo | Definição |
|---|---|
| Hipótese | Trial de 14 dias sem cartão aumenta as clínicas pagas em D60 por cadastro iniciado, porque mais clínicas chegam à ativação antes de decidir |
| Métrica primária | Clínicas com assinatura paga ativa em D60 ÷ `signup_started` |
| Métricas secundárias | Taxa de ativação em 7 dias; conversão trial → pago; cancelamento em D90; chamados de suporte por clínica em trial |
| Guarda-corpo | Parar se a carga da VPS passar do limite definido pelo `devops-sre`, ou se chamados por clínica em trial dobrarem |
| Tamanho mínimo | Com linha de base de 3% e efeito mínimo de +2 p.p. (para 5%), α = 0,05 e poder de 80%: cerca de **1.500 `signup_started` por braço** (teste de duas proporções). Os 3% são hipótese; refazer o cálculo com a linha de base medida |
| Desenho | A/B por visitante, sorteio na landing, se o volume permitir. Se não chegar a 1.500 por braço em 8 semanas (provável no beta), usar **coorte sequencial**: 8 semanas do modelo atual (linha de base) e depois 8 semanas do novo, comparando e declarando a limitação (sazonalidade, mudança de canal) |
| Duração | Mínimo de 8 semanas de entrada mais 60 dias de observação para D60 |
| Critério de decisão | Adotar o 14 dias se a métrica primária subir e o cancelamento em D90 não piorar mais de 2 p.p. Se o efeito ficar dentro do erro, manter o mais simples de operar |

### E2: disposição a pagar e estrutura por porte

| Campo | Definição |
|---|---|
| Hipótese | Consultórios de 1–2 profissionais aceitam pagar entre R$ 229 e 279 e recusam R$ 379; clínicas de 3–5 aceitam R$ 379 |
| Método | Entrevistas Van Westendorp (4 perguntas de preço) com pelo menos 20 clínicas, estratificadas por porte (1–2, 3–5, 6–10), mais uma pergunta de escolha entre a estrutura por clínica e a por profissional |
| Amostra | 20 no mínimo, 8 por estrato no ideal. Fontes: clínicas do beta, leads e contatos do `sales-customer-success`. Sem incentivo financeiro que vicie a resposta |
| Métrica | Faixa de preço aceitável por estrato (cruzamento das curvas "barato demais" e "caro demais") |
| Duração | 3 semanas |
| Critério de parada | 20 entrevistas completas, ou 3 semanas, o que vier primeiro. Abaixo de 12 entrevistas o resultado é exploratório e não decide preço |
| Saída | Valores das faixas da §4.1 confirmados ou substituídos, para decisão do responsável |

### E3: add-on de IA contra plano Ultra (depois do 003)

| Campo | Definição |
|---|---|
| Hipótese | Apresentar a IA como add-on ("Clínica + IA") aumenta a adoção da IA em relação ao plano Ultra separado |
| Métrica primária | Clínicas pagas com IA ativa ÷ clínicas pagas |
| Desenho | Coorte sequencial de 8 semanas (o volume não deve permitir A/B) |
| Pré-requisito | CLIN-QA-003 fechado e franquia definida com 30 dias de uso real |
| Critério de parada | 8 semanas, ou incidente de vínculo errado de paciente na IA (parada imediata) |

## 8. Decisões pedidas ao responsável

| # | Decisão | Depende de |
|---|---|---|
| 1 | Confirmar os limites efetivos de Pro e Ultra em produção e publicá-los na landing | Consulta da §1 |
| 2 | Aprovar a unidade de cobrança (base por clínica com profissionais incluídos) | E2 |
| 3 | Aprovar o E1 (trial de 14 dias sem cartão) e a mudança no `public-checkout` | Camada A do funil |
| 4 | Política de grandfathering e aviso aos clientes atuais | Requer avaliação especializada (contrato) |
| 5 | Add-on de IA no lugar do Ultra | CLIN-QA-003; E3 |

## 9. Fora do escopo desta tarefa

Nenhuma alteração em `src/pages/LandingPage.tsx`, em migration, na tabela `planos` ou no checkout. Nenhuma publicação. Os valores da §4.1 não devem aparecer em material externo antes da decisão 2.
