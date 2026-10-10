# EloLab - QA completo de frontend (2026-10-09)

**Resultado: aprovado com ressalvas.** A rodada foi local; nenhum deploy, migration, DNS, conta ou dado real foi usado. O endpoint Supabase do Vite foi loopback com valores sinteticos.

## Resultados

- Unit/integration: 81 arquivos, 697 testes aprovados, 0 falhas.
- Playwright: 130 casos; 129 aprovados, 1 pulado, 0 falhas. Inclui rotas publicas, formularios, agendamento com API mockada, 67 rotas protegidas avaliadas sem sessao, links de portal e larguras mobile/tablet/desktop.
- QA visual: 4 rotas em 375, 768 e 1440 px; 2 testes passaram e o relatorio final registrou 0 achados.
- TypeScript, lint, build/PWA, a11y, colunas, falhas silenciosas, permissoes e git diff --check passaram.

## Ajustes encontrados pelo QA

- React 18 avisava sobre fetchPriority em uma imagem. Corrigido para loading=eager; os testes de console passaram.
- Os links Esqueci minha senha, Voltar ao site e Voltar para o login tinham altura clicavel de 20 px. Agora tem pelo menos 40 px.
- O rodape da tela de acesso usava texto de 11 px; agora usa 12 px.
- A suite QA visual agora falha para qualquer achado registrado, alem de verificar overflow.

## Evidencias

- Capturas desktop/mobile de site e acesso do app: `2026-10-09-elolab-site-mobile-qa.png`, `2026-10-09-elolab-site-desktop-qa.png`, `2026-10-09-elolab-app-auth-mobile-qa.png`, `2026-10-09-elolab-app-auth-desktop-qa.png`.
- Capturas finais do Orca: `2026-10-09-elolab-site-orca-final.png` e `2026-10-09-elolab-app-auth-orca-final.png`.
- Metricas visuais por viewport: `2026-10-09-elolab-visual-metrics.json`. Largura do documento correspondeu a viewport; zero imagens quebradas, erros de console e excecoes.
- Resumo de comandos e achados: `2026-10-09-elolab-qa-summary.json`.

## Ressalvas

- Uma jornada admin autenticada foi pulada por falta de uma clinica exclusiva de QA. Dashboard autenticado, permissoes por papel, RLS, isolamento entre clinicas e APIs com conta nao foram exercitados.
- As suites de RLS, isolamento, RBAC e smoke publicado foram excluidas: precisam de backend/contas apropriadas e esta rodada nao podia acessar producao.
- O build gerou precache PWA de 7,389.19 KiB. Nao foi executado Lighthouse; revisar esse orcamento de cache e performance em dispositivo/rede controlados.
- Vitest mostra um aviso act(...) existente no teste de busca de pacientes e logs esperados nos testes que simulam erros de rede/banco; nao causaram falhas.

As previas locais continuam disponiveis em `http://127.0.0.1:8080/` e `http://127.0.0.1:8080/auth`, abertas no Orca.
