# Rodada 1: growth-marketing

Data: 27/10/2026.

## O que fiz

Escrevi as três propostas de GTM pedidas em `docs/time/rodada-1/TAREFAS.json`. Os dois primeiros documentos vieram de uma execução interrompida e foram revisados nesta sessão; o terceiro foi escrito agora.

1. `docs/gtm/posicionamento-por-segmento.md`: tabela do que existe e do que não existe no código, com evidência; posicionamento-base; mensagem, dor, decisor, o que não dizer e prova necessária para clínicas, laboratórios, redes e odonto; pontos da landing para revisão (sem editar a landing); plano de prova social com autorização por escrito.
2. `docs/gtm/plano-analytics.md`: funil com definições operacionais (incluindo ativação); arquitetura em duas camadas (servidor no Supabase sem cookie; navegador com consentimento); comparação de ferramentas e recomendação de PostHog Cloud EU; integração com `CookieConsent` e `src/lib/cookies.ts`; dicionário de eventos sem dado de paciente; convenção de UTM e repasse entre domínios; SEO técnico.
3. `docs/gtm/pricing-proposta.md`: estado atual dos planos; benchmark público datado com URLs; planos por porte com profissional adicional; add-ons; trial de 14 dias sem cartão; três experimentos (hipótese, métrica, tamanho mínimo, duração e critério de parada); decisões pedidas ao responsável.

## Arquivos tocados

- `docs/gtm/posicionamento-por-segmento.md` (já existia, da execução interrompida)
- `docs/gtm/plano-analytics.md` (já existia, da execução interrompida)
- `docs/gtm/pricing-proposta.md` (novo)
- `docs/time/rodada-1/growth-marketing.md` (este arquivo)

Não toquei `src/pages/LandingPage.tsx`, migrations, edge functions nem código.

## Evidências

- `grep -rn -E "gtag|posthog|plausible|umami|utm_|dataLayer|mixpanel|amplitude" src index.html package.json`: sem resultado, ou seja, não há analytics nem UTM.
- `src/lib/cookies.ts:113-129`: o catálogo declara `_ga`, `_gid` e `_fbp`, que não estão instalados.
- `src/pages/MapaColeta.tsx:346-347` e `package.json` sem biblioteca de código de barras: a promessa de código de barras em `LandingPage.tsx:209` não tem base.
- `supabase/migrations/20261010230000_planos_pro_ultra_precos_e_recursos.sql:1-21`: Pro R$ 379 e Ultra R$ 499; a única diferença é `agente_ia`.
- `supabase/migrations/20260522171216_def6af16-0ae1-4b40-bcb5-d409997e411c.sql:86-95` e `20260303170248_*.sql:79,89`: o `UPDATE` de limites mira os slugs `pro`, `max` e `ultra`, e os planos à venda são `elolab-max` e `elolab-ultra`. `grep -rn -i "update public.planos" supabase/migrations` não encontrou outro ajuste de limites. Pelas migrations, Pro e Ultra ficam com 3 médicos, 2 recepcionistas, 10 pessoas e 1 GB.
- `supabase/functions/public-checkout/index.ts:76-78` e `20261010198000_checkout_provisionamento_seguro.sql:222`: trial de 3 dias, só com cartão.
- Benchmark consultado por WebFetch em 27/10/2026: iClinic (https://iclinic.com.br/precos/), Clinicorp (https://www.clinicorp.com/planos) e Simples Dental (https://www.simplesdental.com/planos-e-precos). Feegow (https://feegow.com/planos) falhou com `SSLV3_ALERT_HANDSHAKE_FAILURE`. Amplimed, Ninsaúde e ProDoctor não publicam preço (fonte: `docs/estrategia/funcoes/04-ux-gtm.md` §3, na mesma data).

Nenhum teste rodado: só entreguei documentos.

## Riscos

- **P1 comercial (hipótese a confirmar):** se os limites padrão valem em produção, uma clínica com 4 ou mais médicos não consegue usar Pro nem Ultra, e a FAQ (`LandingPage.tsx:212-213`) não informa os limites. Produção NÃO VERIFICADA.
- A landing promete código de barras (`:209`) e ICP-Brasil via Memed (`:146`) sem base verificada. Precisa ser corrigida pelo dono da landing antes de qualquer campanha.
- O catálogo de cookies declara rastreadores inexistentes. A correção deve vir junto com a ferramenta escolhida, com revisão do DPO (requer avaliação especializada).
- Os preços da proposta são hipóteses. Não podem ir para material externo antes da pesquisa E2 e da decisão do responsável.
- O tamanho mínimo do E1 (cerca de 1.500 cadastros por braço) não deve ser atingido no beta. O plano B é coorte sequencial, com as limitações declaradas.
- Transferência internacional (PostHog EU), base legal da camada A e modelo de autorização de depoimento: requerem avaliação especializada.

## Próximo dono

| Tema | Dono |
|---|---|
| Confirmar limites de Pro e Ultra em produção | `database-engineer` com o responsável |
| Corrigir `LandingPage.tsx:209`, `:146` e `:212-213` | `frontend-developer` com o `product-designer` |
| Visões da camada A do funil (migration local) | `backend-developer` e `database-engineer` |
| `src/lib/analytics.ts`, repasse de UTM e catálogo de cookies | `frontend-developer`; DPO |
| Entrevistas de preço (E2) e coleta de prova social | `sales-customer-success` |
| Decisões da §8 de `pricing-proposta.md` | Responsável |
