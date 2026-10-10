# EloLab APP - readiness para producao (2026-10-09)

## Decisao

**Nao liberar para producao ainda.** Build e suites locais passam, mas faltam evidencias de seguranca multi-tenant e fluxos autenticados. Nenhum deploy, migration, DNS, conta ou dado real foi usado nesta rodada.

## Execucao local

- 2026-10-09, apos endurecer o harness: Vitest sem variaveis Supabase configuradas, 82 arquivos e 701 testes passaram. O cliente de teste usa URL loopback e chave sintetica por padrao.
- Testes E2E de RLS, RBAC e isolamento sem QA config explicita: 41 casos pulados com sucesso, sem fallback cloud. As suites de escrita exigem QA_SUPABASE_DISPOSABLE=ELOLAB_LOCAL_DISPOSABLE; chamadas Edge/WhatsApp exigem stub local confirmado.
- Focados do harness e integracao: 3 arquivos, 9 testes passaram. `npx tsc --noEmit -p tsconfig.node.json`, `npm run lint -- --quiet` e `git diff --check`: passaram.
- Supabase local nao estava ativo (Docker/Podman indisponivel na verificacao anterior); por isso RLS/RBAC/isolation reais nao foram executados. Nenhum endpoint externo foi consultado nesta etapa.
- Task 2 de auth E2E: `npx playwright test tests/auth.spec.ts --reporter=line` em Chromium local, Vite `--mode test`, porta 4176: 4 passaram. Login rejeitado usa resposta Supabase interceptada no Playwright, confirma mensagem acessivel, mantem campos/botoes/recuperacao visiveis e nao depende de backend real. Auth e landing afirmam zero erros de console e `pageerror`.
- A primeira execucao da Task 2 revelou seletores ambiguos e um heading diferente do presumido; os seletores foram corrigidos para a semantica real do formulario. A repeticao passou.
- Lint geral iniciado em paralelo com Playwright encontrou apenas uma corrida ao ler `test-results` enquanto o runner criava/apagava artefatos (`ENOENT`); a repeticao sequencial de lint passou. `npx tsc --noEmit -p tsconfig.node.json` e `git diff --check` tambem passaram apos as alteracoes.
- Task 3: `npx playwright test tests/qa-ux.spec.ts --reporter=line` em Chromium local/Vite test: 3 passaram. Foram verificados 16 pares rota/viewport para landing, login, redefinicao de senha e planos, nos tamanhos 375, 768, 1024 e 1440 px. Capturas e findings JSON foram anexados ao relatorio HTML local do Playwright (`playwright-report/index.html`) e revistos visualmente; sem overflow ou achados bloqueadores.
- O App agora usa `MotionConfig reducedMotion="user"`; com media `reduce` ativa, o E2E confirmou que a transicao de movimento do cartao de autenticacao esta neutralizada. Build Vite/PWA passou (175 itens no precache, 7,389.42 KiB), assim como TypeScript, lint e `git diff --check`.
- Task 4: verificacao local sem endpoint externo: Docker nao esta instalado, nao ha variaveis `QA_*` no processo e a CLI Supabase nao esta instalada localmente. A tentativa inicial `npx supabase status` tentou obter a CLI; foi cancelada antes de concluir, sem mudanca em manifests/lockfiles. Nenhum secret/valor de `.env` foi lido. Reexecucao das suites RLS/RBAC/isolation: 41 puladas, zero requisicoes de backend.
- WhatsApp e Mercado Pago nao foram chamados: nao ha stub local/ambiente isolado confirmado nesta sessao. Documentacao versionada (`ROADMAP_COMERCIAL_SAAS.md`, `EASYPANEL-VPS.md`, `AUDITORIA_MODULOS_QA.md`) ja registra como pendentes teste de restauracao, backup externo criptografado, canal externo de alertas, smoke autenticado por perfil e smoke pos-release. Nenhum deploy, migration ou dado real foi alterado.
- Vitest, com `VITE_SUPABASE_URL=https://supabase.test` e chave sintetica: 81 arquivos, 697 testes passaram.
- Playwright Chromium local, com Vite local, URL Supabase loopback e chaves sinteticas: 130 casos, 129 passaram, 1 pulado, 0 falhas. O caso pulado e a jornada admin com clinica de QA dedicada.
- TypeScript, lint, build, check:a11y, check:colunas, check:falhas, check:permissoes e `git diff --check`: passaram.
- Build PWA: 175 arquivos em precache, 7,389.19 KiB. Lighthouse nao foi executado.
- Os specs RLS, RBAC autenticado, isolamento entre clinicas, smoke publicado e Mercado Pago sandbox nao foram executados.

## Pendencias antes de aprovar release

### P1 - Seguranca e backend isolado

1. Disponibilizar Supabase local/QA descartavel com duas clinicas e usuarios de teste por papel; executar RLS e tentativas de acesso cruzado em tabelas e Edge Functions sem usar producao. Docker/CLI e config QA nao estao disponiveis neste workspace.
2. Executar RLS anonimo de leitura e mutacao somente contra Supabase local descartavel, depois de iniciar backend local; nenhuma mutacao e executada sem marcador explicito de banco descartavel.
3. O cliente Supabase gerado ainda contem fallback embutido, mas as configuracoes padrao de Vitest e Vite E2E agora substituem URL/chaves de teste por loopback e falham ao receber host nao-loopback. Verificar tambem os comandos de CI antes de habilitar suites autenticadas.

### P1 - Jornadas autenticadas

4. Executar jornada completa com conta admin exclusiva: login, dashboard, navega??o, agenda, pacientes, prontuario, documentos, upload/storage e logout.
5. Executar a matriz de RBAC para admin, medico, recepcao, enfermagem e financeiro, validando telas permitidas e negadas, nao apenas redirecionamento sem sessao.
6. Validar token do portal do paciente, isolamento por clinica e principais estados de erro/loading/vazio contra backend isolado.

### P2 - Design, testes e performance

7. Capturar telas autenticadas em mobile, 768, 1024 e desktop; ainda dependem de conta QA isolada por perfil.
8. Reduced-motion agora esta aplicado no contexto global Framer Motion e verificado na tela de autenticacao; revisar demais fluxos animados em QA autenticado durante homologacao.
9. Fortalecer `tests/auth.spec.ts`: o caso de senha incorreta nao afirma que erro aparece, e o caso de console coleta erros sem assertar o array.
10. Medir Lighthouse/Core Web Vitals em build de preview e revisar o precache PWA de 7.4 MiB em dispositivo/rede controlados.

### P2 - Integracoes e operacao

11. Testar checkout Mercado Pago somente com credenciais de sandbox, depois de ler o handoff. Testar WhatsApp/Edge Functions em ambiente isolado. Esta rodada nao alterou essas integracoes.
12. Validar migrations, variaveis/secrets de deploy, backup/restauro, alertas externos, smoke publicado e plano de rollback antes de uma liberacao autorizada. A documentacao ainda marca backup externo/restore, canal externo de alertas e smoke como pendentes.

## Achados de teste corrigidos nesta rodada

- O harness das suites RLS, RBAC e isolamento deixou de ler chave do cliente ou URL cloud; agora exige QA Supabase explicitamente configurado em loopback. Ações mutaveis e chamadas com possiveis efeitos externos exigem opt-ins separados.
- Vitest e Vite em modo `test` usam loopback e chave sintetica quando as variaveis estao ausentes. O helper tem testes para defaults, rejeicao de host externo e exigencia de configuracao QA.
- Mocks MSW de pacientes/medicos e o teste de `storageUrlSeguro` agora derivam o host de `VITE_SUPABASE_URL`, permitindo usar `supabase.test` sem tocar em servicos externos.
- Os testes focados passaram: 2 arquivos, 5 testes.
- Nenhuma tela, API, dado, autenticacao ou integracao de producao foi alterada nesta revisao.

## Revisao independente de design/QA

- P1: nao ha evidencias visuais do dashboard autenticado nem de jornadas por perfil.
- Cobertura das rotas publicas agora inclui 1024 px; vistas autenticadas continuam sem conta de QA.
- Reduced-motion tem configuracao global e um teste de integracao autenticacao; a auditoria de fluxos animados autenticados ainda depende de ambiente e contas locais.
- P1: RLS/isolation e RBAC autenticados ainda nao foram exercitados em backend de QA.
- P2: o E2E de senha incorreta e o coletor de console em `tests/auth.spec.ts` podem passar sem validar o comportamento anunciado.

As previsualizacoes locais previamente abertas seguem em `http://127.0.0.1:8080/` e `/auth` no Orca.
