# CLIN-QA-540: Limites de usuários dos planos à venda conferidos e informados

| Campo | Valor |
|---|---|
| Item de origem | Risco P1 comercial do growth-marketing (`docs/time/rodada-1/growth-marketing.md`, seção Riscos) |
| Gravidade | P1 comercial, **hipótese**. O estado de produção não foi verificado |
| Impacto | Comercial. Uma clínica com 4 ou mais médicos pode não conseguir usar os planos Pro e Ultra, e a landing não informa os limites |
| Perfil | Gestor da clínica no checkout; administrador da plataforma |
| Esforço | S |
| Dono sugerido | `database-engineer` (leitura e correção), `growth-marketing` (texto da FAQ) |
| Dependências | Leitura só leitura de `planos` na VPS, com autorização do responsável; decisão de preço e limites do responsável |
| Status | Bloqueado por decisão do responsável (27/10, criada na rodada 2) |

## Contexto
O `UPDATE` de limites das migrations mira os slugs `pro`, `max` e `ultra`, e os planos à venda são `elolab-max` e `elolab-ultra`. Pelas migrations, os dois ficam com os limites padrão: 3 médicos, 2 recepcionistas, 10 pessoas e 1 GB.

## Evidência (E1, growth-marketing; não reconferida pelo PO)
- `supabase/migrations/20260522171216_def6af16-0ae1-4b40-bcb5-d409997e411c.sql:86-95` e `20260303170248_*.sql:79,89`.
- `supabase/migrations/20261010230000_planos_pro_ultra_precos_e_recursos.sql:1-21`.
- `src/pages/LandingPage.tsx:212-213`: a FAQ não informa limites.

## Critérios de aceite
- **CA1 (conferência).** Dada a tabela `planos` em produção, quando o responsável roda a consulta só leitura, então os limites de cada plano à venda ficam registrados neste arquivo.
- **CA2 (correção).** Dados os limites decididos pelo responsável, quando a migration local é aplicada com autorização, então cada plano à venda tem os limites decididos.
- **CA3 (landing).** Dada a landing, quando o visitante lê os planos, então os limites aparecem e batem com o banco.
- **CA4 (erro).** Dado um usuário que excede o limite do plano, quando tenta convidar mais um profissional, então recebe mensagem traduzida com o limite e a forma de mudar de plano.
- **CA5 (permissão negada).** Dado um usuário que não é administrador da plataforma, quando tenta alterar `planos`, então é negado.
- **CA6 (outra clínica).** Dado o limite da clínica A, quando ela atinge o limite, então a contagem não inclui usuários da clínica B.

## Definição de pronto
DoD comum, mais: não alterar o financeiro de pacientes; texto da landing revisado contra o banco.
