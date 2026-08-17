# Revisão de segurança — EloLab

## Atualização final — 17/08/2026

Todas as pendências deste relatório foram migradas:

- `xlsx@0.18.5` foi removido e substituído por `read-excel-file` e `write-excel-file`;
- links públicos de guias agora expiram em 90 dias e têm rate limit atômico por IP;
- a CSP de produção não permite scripts inline;
- URLs vindas do backend passam por allowlist HTTPS de Mercado Pago ou do host configurado do Supabase;
- Vite 8.2.1, Vitest 4.1.10 e React Router 7.18.2 eliminaram os alertas restantes do audit.

Validação final: 442 testes aprovados, TypeScript, build e ESLint aprovados; `npm audit` com zero vulnerabilidades.

## Resumo executivo

O EloLab possui uma base de segurança acima da média para um SPA clínico: RLS é testada contra acesso anônimo, operações privilegiadas usam Edge Functions, o CI é reproduzível e há cabeçalhos defensivos em produção. Nesta revisão foram corrigidas três superfícies de XSS, atualizadas dependências compatíveis e adicionados limites à importação de planilhas. Permanecem duas decisões arquiteturais de alta prioridade: migrar a biblioteca `xlsx` e definir expiração/limitação de uso para links públicos de guias.

## Alta prioridade

### SEC-001 — `xlsx` vulnerável ao processar arquivos fornecidos por usuários

- Severidade: Alta
- Local: `src/lib/importacao/planilha.ts:86`; `package.json`
- Evidência: a aplicação usa `xlsx@0.18.5`; o audit aponta prototype pollution e ReDoS, sem correção no pacote npm.
- Impacto: uma planilha maliciosa pode consumir recursos excessivos ou explorar comportamentos inesperados durante a importação no navegador.
- Mitigação aplicada: limite de 10 MB e 100.000 linhas em `src/lib/importacao/planilha.ts:15-16,100-102,118-120`.
- Correção definitiva: migrar leitura/escrita para uma biblioteca mantida ou para uma versão corrigida oficialmente distribuída, preservando compatibilidade com `.xls` apenas se indispensável.

### SEC-002 — Tokens públicos de guias não possuem expiração nem rate limit visível

- Severidade: Alta
- Local: `supabase/migrations/20260522163342_4375d647-d8be-4414-91c6-1d1623017749.sql:79-87`; `supabase/functions/public-guias-externas/index.ts:22-45`
- Evidência: o token aleatório possui estado `ativo` e `ultimo_uso`, mas não `expires_at`; a função valida apenas token + estado.
- Impacto: um link copiado ou vazado continua aceitando dados sensíveis indefinidamente, até revogação manual.
- Correção recomendada: adicionar expiração configurável, rotação e limitação por token/IP na borda. A migração precisa de decisão operacional para não invalidar links ativos sem aviso.

## Média prioridade

### SEC-003 — CSP permite scripts inline

- Severidade: Média
- Local: `vercel.json:28`
- Evidência: `script-src` contém `'unsafe-inline'`.
- Impacto: reduz a proteção da CSP contra injeção de script.
- Correção recomendada: inventariar scripts inline do MercadoPago, migrar para nonce/hash e remover `'unsafe-inline'` após teste em modo report-only.

### SEC-004 — URLs externas retornadas pela API são abertas sem allowlist uniforme

- Severidade: Média
- Local: `src/hooks/useSubscriptionPlan.ts:180,219`; `src/pages/PortalPaciente.tsx:863,1106`; `src/pages/Configuracoes.tsx:794`
- Evidência: valores de API/banco são enviados diretamente para `window.location.href` ou `window.open`.
- Impacto: dado comprometido no backend pode provocar redirecionamento malicioso ou phishing.
- Correção recomendada: centralizar validação de protocolo/origem e permitir somente Supabase Storage, MercadoPago e origens explicitamente necessárias.

## Corrigido nesta revisão

### SEC-005 — HTML de template de e-mail podia executar marcação ativa na prévia

- Severidade original: Alta
- Local: `src/pages/TemplatesEmail.tsx:58,100,220,390`
- Correção: sanitização com DOMPurify na persistência e antes de `dangerouslySetInnerHTML`.

### SEC-006 — Impressões interpolavam dados clínicos sem escape

- Severidade original: Alta
- Local: `src/pages/MapaColeta.tsx:166-169`; `src/components/relatorios/RelatorioCustomizado.tsx:386-400`
- Correção: todos os valores variáveis passam por `escapeHtml` antes de `document.write`.

### SEC-007 — Dependências compatíveis estavam desatualizadas

- Severidade original: Crítica/Alta
- Correção: atualização compatível levou Vitest a 3.2.7, Vite a 5.4.21, React Router a 6.30.4, PostCSS a 8.5.26 e DOMPurify a 3.4.13. O audit caiu de 28 para 5 vulnerabilidades e não contém mais achados críticos.

## Verificação

- Unitários/integração: 440 testes aprovados.
- TypeScript: aprovado.
- Build de produção: aprovado.
- ESLint: aprovado sem erros.
- E2E: 81 aprovados, 9 pulados por ausência de credenciais multi-clínica e 6 flaky que passaram na repetição após timeout inicial do servidor.
- RLS anônima, permissões, colunas, falhas silenciosas e acessibilidade: aprovadas.

## Limitação da revisão conjunta

O Claude CLI está instalado, autenticado e funcional, mas o Orca 1.4.184 encerrou a conexão em três tentativas de `worker-start`, antes de atribuir um terminal ao dispatch. Portanto, não há parecer independente do Claude nesta versão do relatório.
