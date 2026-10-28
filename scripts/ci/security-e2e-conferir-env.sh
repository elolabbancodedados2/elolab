#!/usr/bin/env bash
# Confere, antes de rodar o Playwright, que toda variável lida pelas três
# suítes de segurança existe. Falha com a lista do que falta em vez de deixar
# as specs pularem em silêncio. Não imprime valores.
set -euo pipefail

obrigatorias=(
  QA_SUPABASE_URL QA_SUPABASE_ANON_KEY QA_SUPABASE_DISPOSABLE
  QA_CLINICA_A_EMAIL QA_CLINICA_A_PASSWORD
  QA_CLINICA_B_EMAIL QA_CLINICA_B_PASSWORD
  QA_ADMIN_EMAIL QA_ADMIN_PASSWORD
  QA_MEDICO_EMAIL QA_MEDICO_PASSWORD
  QA_RECEPCAO_EMAIL QA_RECEPCAO_PASSWORD
  QA_ENFERMAGEM_EMAIL QA_ENFERMAGEM_PASSWORD
  QA_FINANCEIRO_EMAIL QA_FINANCEIRO_PASSWORD
  QA_E2E_PACIENTE_TOKEN
)

faltando=()
for nome in "${obrigatorias[@]}"; do
  [ -n "${!nome:-}" ] || faltando+=("$nome")
done

if [ "${#faltando[@]}" -gt 0 ]; then
  echo "::error::Variáveis QA_* ausentes depois do seed: ${faltando[*]}"
  exit 1
fi

# perfis-rbac.spec.ts deriva a chave de sessão do localStorage do hostname
# (CLIN-QA-564): com "localhost" ela não bate com a do app.
[ "$QA_SUPABASE_URL" = "http://127.0.0.1:54321" ] || {
  echo "::error::QA_SUPABASE_URL deve ser exatamente http://127.0.0.1:54321"
  exit 1
}
echo "Variáveis QA_* conferidas: ${#obrigatorias[@]}."
