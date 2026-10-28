# Rodada 1: product-manager

Data: 27/10/2026

## O que fiz

- Li `docs/time/REGRAS_DO_TIME.md`, `docs/estrategia/DIAGNOSTICO_16_FUNCOES.md` (inteiro) e `docs/estrategia/funcoes/01-produto-dominio.md`.
- Escrevi a estratégia dos 4 segmentos (problema, ICP, proposta de valor, requisitos para vender, gate e métrica), a definição das métricas e a forma de medi-las, a priorização (custo do atraso para o gate de estabilização e RICE para o que vem depois), o roadmap de T1 a T4, 5 decisões pendentes do responsável e o repasse priorizado ao `product-owner`.
- Reconferi nos sites oficiais o baseline de 5 concorrentes (Feegow, iClinic, ProDoctor, Clinicorp e Simples Dental).

## Arquivos tocados

- `docs/produto/estrategia/segmentos-e-roadmap.md` (novo)
- `docs/time/rodada-1/product-manager.md` (novo, este arquivo)

Não alterei nenhum outro arquivo. Sem código, migration, deploy, commit ou acesso à VPS.

## Evidências

| Verificação | Comando ou fonte | Resultado |
|---|---|---|
| Preço dos planos EloLab | Leitura de `supabase/migrations/20261010230000_planos_pro_ultra_precos_e_recursos.sql:1-22` | Pro R$379 e Ultra R$499. O Ultra inclui o `agente_ia`. O valor em produção está NÃO VERIFICADO |
| Trial com cartão | Grep em `src/pages/LandingPage.tsx` | `:197` e `:603`: 3 dias com cartão |
| Atributo de segmento na clínica | Grep `segmento\|tipo_clinica\|tipo_estabelecimento` em `supabase/migrations` | 1 ocorrência, um comentário sem relação (`20261011000000_laboratorio_lis_foundation.sql:303`). Não há atributo de segmento, então a receita por segmento não é mensurável hoje |
| Feegow | WebFetch https://feegowclinic.com.br/precos-e-planos/ (27/10/2026) | R$129, 199 e 249 por profissional; TISS desde o Starter; "Assinatura digital" no Plus, sem citar ICP |
| iClinic | WebFetch https://iclinic.com.br/precos/ (27/10/2026) | R$99, 129, 169 e 299; TISS a partir do Plus; 5 dias sem cartão |
| ProDoctor | WebFetch https://prodoctor.net/precos (27/10/2026) | ICP-Brasil nos 4 planos; Multilocal contratado à parte |
| Clinicorp | WebFetch https://www.clinicorp.com/planos (27/10/2026) | R$159,90 e R$369,90; Pix e boleto incluídos; informação sobre unidades contraditória entre a tabela e o FAQ |
| Simples Dental | WebFetch https://www.simplesdental.com/planos-e-precos (27/10/2026) | R$137,41, 229,08 e 320,74 (anual), **diferente** dos R$149,90–349,90 do diagnóstico; 7 dias sem cartão |

## Riscos

- O RICE usa alcance e confiança estimados, sem dados de uso, porque não há analytics (016). O esforço é uma conversão do S/M/L e não foi validado pelo `tech-lead`.
- O plano Ultra vende IA no WhatsApp enquanto 003 (P0) e 009 estão abertos (decisão D-05).
- Sem atributo de segmento no cadastro da clínica, as metas de receita por segmento não podem ser acompanhadas.
- A divergência de preço do Simples Dental e a contradição da Clinicorp sobre unidades precisam de nova conferência antes de qualquer material comercial.

## Próximo dono

- `product-owner`: transformar o repasse da seção 8 em histórias, alinhado com a tarefa dele nesta rodada.
- `tech-lead`: confirmar o esforço em pessoa-semana e a capacidade por trimestre.
- `software-architect`: definir como registrar o segmento da clínica para a métrica de receita.
- Responsável: decidir D-01 a D-05 (seção 7 do documento).
- `ux-researcher` e `sales-customer-success`: discovery 034 (5 entrevistas por segmento de rede e de odonto).
