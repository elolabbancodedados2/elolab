# E09 — Gerador TISS XML

- **Feito:** modelo tipado para lote e guias de consulta/SP-SADT; geração de XML de rascunho com escape de conteúdo e hash SHA-256 determinístico. Não integra a tela.
- **Arquivos:** `src/lib/tiss/index.ts`, `src/lib/tiss/gerarLote.test.ts`, `src/lib/tiss/README.md`.
- **Verificações:** `rtk proxy npx tsc --noEmit -p tsconfig.app.json` — passou (exit 0); `rtk proxy npx eslint src/lib/tiss/index.ts src/lib/tiss/gerarLote.test.ts` — passou (exit 0). `rtk proxy npx vitest related --run src/lib/tiss/index.ts src/lib/tiss/gerarLote.test.ts` — não iniciou os testes: Vite não carregou `@swc/core-win32-x64-msvc` e recebeu `spawn EPERM` ao resolver dependências. O Vitest permanece **não verificado**.
- **Pendências:** o XSD/schema oficial não está no repositório; obter os schemas ANS de Comunicação e Conteúdo/Estrutura e validar antes de gerar XML de transmissão. O XML atual é explicitamente rascunho e não deve ser transmitido. A versão alvo documentada é 04.03.00 (ANS, setembro/2026); lotes existentes podem usar 04.01.00. Requer avaliação especializada para confirmar leiaute e campos obrigatórios por operadora.
