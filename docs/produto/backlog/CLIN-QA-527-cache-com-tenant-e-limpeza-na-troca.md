# CLIN-QA-527: Chaves de cache com a clínica e prova de que a troca de clínica não mostra dado anterior

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-014 (206), ação 60.4 |
| Gravidade | P1 [hipótese] |
| Impacto | Clínico e de privacidade. Na impersonação ou na futura troca de unidade, a tela pode mostrar por instantes dados da clínica anterior |
| Perfil | Admin de plataforma (impersonação); futuro gestor de rede |
| Esforço | M |
| Dono sugerido | `frontend-developer`; `qa-engineer` (e2e) |
| Dependências | Nenhuma |
| Status | Aberto (27/10, após a rodada 2) |

## Contexto e evidência
- Mitigação já existente (observação do PO nesta rodada): `src/contexts/SupabaseAuthContext.tsx:78-86` limpa todo o cache (`queryClient.clear()`) quando muda o par usuário e clínica, e `src/hooks/useSupabaseData.ts:42` já inclui `clinica_id` na chave. O risco do diagnóstico é menor do que o relatado, mas não há teste que prove o comportamento.
- `grep -rn "queryKey:" src` (sem testes) = 594 ocorrências nesta rodada; quantas não têm tenant: SÓ RELATADO (401 de 581 no diagnóstico).

## Proposta
Fábrica de chaves com a clínica no primeiro segmento, migrando primeiro agenda e fila; teste e2e da troca.

## Critérios de aceite
- **CA1 (outra clínica).** Dado um admin de plataforma impersonando a clínica A com a Agenda aberta, quando troca para a clínica B, então nenhum agendamento, paciente ou valor da A aparece em nenhum momento (e2e com captura antes e depois da troca).
- **CA2 (caminho principal).** Dado um usuário comum, quando navega entre telas, então o cache continua sendo reaproveitado (sem regressão de desempenho perceptível).
- **CA3 (permissão negada).** Dado um usuário que perde o vínculo com a clínica durante a sessão, quando a próxima consulta roda, então o cache é limpo e a tela mostra a mensagem de acesso negado traduzida.
- **CA4 (padrão).** Dados os domínios agenda e fila, quando se procura `queryKey`, então todas as chaves vêm da fábrica.
- **CA5 (erro).** Dada falha na consulta depois da troca, quando ocorre, então a tela mostra estado de erro, não o dado da clínica anterior.

## Definição de pronto
DoD comum, mais: e2e do CA1 rodando no CI (banco efêmero, CLIN-QA-510).

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Sem trabalho nas rodadas 1 e 2.

### O que falta
- Depende do primeiro run verde da 510.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
