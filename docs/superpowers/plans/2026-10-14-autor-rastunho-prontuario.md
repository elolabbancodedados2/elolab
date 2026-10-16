# Identificação do autor do rascunho clínico

> **Execution:** inline, continuing the user's standing instruction to complete the goal without approval stops.

**Goal:** identificar nominalmente quem é o autor do rascunho e mostrar a data completa do último salvamento na fila de retomada.

**Architecture:** preservar o autosave no Supabase e o filtro atual pelo médico autenticado. Resolver o nome a partir da lista clínica de médicos, com fallback para o nome do perfil da sessão; nunca expor IDs como rótulos.

**Tech Stack:** TypeScript, React, Vitest.

**Spec:** item 31 de `docs/ROADMAP_MELHORIAS_100_E_5_MODULOS.md`. A persistência e retomada já existem desde `cbca3db`; E48 cobre somente atribuição nominal e timestamp com ano.

## Escopo de arquivos

- `src/lib/prontuarioDrafts.ts`: resolver autor humano de forma segura.
- `src/lib/__tests__/prontuarioDrafts.test.ts`: teste primeiro para nome vinculado, fallback da sessão e ausência de autor.
- `src/pages/Prontuarios.tsx`: exibir autor e data/hora completa na fila.
- `docs/ROADMAP_MELHORIAS_100_E_5_MODULOS.md`: registrar E48 após validação.

## Tarefas

### 1. Atribuição nominal

- [x] Adicionar testes falhando para nome resolvido pelo `medico_id`, fallback do usuário autenticado e ID ausente sem vazar UUID.
- [x] Implementar o helper mínimo e conectar o autor e `dd/MM/yyyy HH:mm` à linha acessível de cada rascunho.
- [x] Rodar Vitest focado, suite completa, TypeScript, checks do repositório e build; revisar isolamento de rascunhos e ausência de persistência clínica em storage do browser.
- [x] Atualizar item 31 para E48 e 47/100, commitar e validar `dist/version.json` contra o commit.

## Review focus

- O rótulo deve usar o registro de médico cujo ID coincide com `medico_id` e não nomes de outros médicos.
- Médico ausente deve usar fallback do perfil autenticado; sem fallback, usar rótulo genérico e nunca o UUID.
- O horário deve ser o `updated_at` persistido mais recente, com ano.
- A listagem deve continuar filtrada pelo médico atual.
