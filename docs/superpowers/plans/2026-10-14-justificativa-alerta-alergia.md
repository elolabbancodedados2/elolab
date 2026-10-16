# E51 - Justificativa ao prosseguir diante de alerta de alergia

## Escopo

O motor da prescrição já sinalizava alergias e bloqueava alergia direta. Tornar justificativa obrigatória quando o profissional confirma um risco alérgico ignorável; manter a decisão e os alertas em trilha imutável no registro.

## Execução e validação

- [x] Escrever testes do helper antes da implementação; confirmar falha inicial.
- [x] Exigir 20 a 1.000 caracteres de justificativa no modal e bloquear a confirmação sem o mínimo.
- [x] Registrar alertas, justificativa, usuário e hora pelo banco; proteger contra alteração e exigir usuário autenticado quando há alertas.
- [x] Vitest focado: 47/47 (helper e motor de alertas).
- [x] PGlite descartável: 11 assertions; justificativa ausente/curta/longa, usuário/hora, imutabilidade, alertas sem alergia, sem alertas.
- [x] Vitest integral: 297 arquivos e 1.443 testes.
- [x] TypeScript e checks de acessibilidade, permissões, colunas, falhas silenciosas e `git diff --check`.
- [x] Build pós-commit concluído; `dist/version.json` coincide com HEAD.

A migration permanece local, sem aplicação remota. O fluxo de emissão pela integração externa Memed é separado e não usa a gravação local deste override.
