# N4: Higienização de salas e controle de infecção

## Auditoria do checkout

- A tela existente de salas controlava `disponivel`, `ocupado`, `manutencao` e `limpeza`, com ação manual “Pronta”. Não existia checklist por sala, execução versionada, inspeção ou trilha de decisão.
- A lista de equipamentos do laboratório trata analisadores e calibração laboratorial; não cobre ciclo de limpeza dos ambientes clínicos.

## Implementação

- Nova rota autenticada `/higiene-salas` e item de menu para admin, recepção e enfermagem.
- Checklist clínico versionado pelo admin; cada execução mantém a versão e a resposta usadas, horário e responsáveis.
- Revisão append-only por admin/enfermagem. Reprovação mantém a sala bloqueada; aprovação libera a sala na mesma transação.
- O início move a sala para `limpeza`; salas em uso/manutenção e inspeções pendentes não iniciam outro ciclo.
- Função de banco bloqueia alteração autenticada de `limpeza` ou `ocupado` direto para `disponivel`. A tela antiga encaminha “Inspecionar” para o novo fluxo.
- Tabelas privadas sem grants diretos ao navegador. Edge Function valida JWT, clínica, perfil ativo e papel; RPCs transacionais verificam novamente clínica/papel e limitam escrita ao service role.
- Checklist, execução submetida, revisão e auditoria são imutáveis, inclusive contra delete. Execução valida IDs, rótulos, itens obrigatórios e tamanho no banco.

## Validação local

- Vitest contrato de migration: 2/2.
- Playwright Chromium sintético: 1/1, criação de execução, bloqueio durante revisão e liberação somente após aprovação.
- TypeScript, build, `deno check`, ESLint focal (sem erros; 26 avisos `any` preexistentes em `Salas.tsx`) e checks de colunas, falhas silenciosas, permissões e acessibilidade aprovados.
- Parser PostgreSQL: 48 instruções; parser PL/pgSQL: 6 funções.
- Banco PostgreSQL efêmero PGlite em memória aplicou a migration e executou as RPCs: aprovou ciclo completo, bloqueio por clínica/papel, rejeição que mantém sala bloqueada, item obrigatório incompleto, edição de item adulterado, bloqueio de novo ciclo enquanto revisão está pendente, trilha imutável e bloqueio de liberação direta autenticada.
- Playwright usa Edge Function simulada. Não há PostgreSQL/Supabase remoto descartável configurado; a migration permanece sem aplicação remota e nenhum dado clínico real foi alterado. O pacote de QA temporário e a instância em memória foram removidos ao final.
