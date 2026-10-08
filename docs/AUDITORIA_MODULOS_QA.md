# Inventário e plano de QA do EloLab

Inventário derivado das rotas em `src/App.tsx` e da navegação em
`src/config/sidebarMenu.ts`. Rotas que só redirecionam estão agrupadas com o
módulo de destino. A lista separa o produto usado pelas clínicas da operação
interna do SaaS.

## Produto para clínicas

| Área | Módulos e fluxos | Perfis principais |
|---|---|---|
| Acesso e contratação | Landing page, planos, cadastro/login, convite de funcionário, redefinição de senha, termos, privacidade e cookies | Público, equipe |
| Início e colaboração | Dashboard, notificações, chat interno, tarefas, primeiros passos, indicadores de produtividade, treinamento e feedback | Administrador e equipe, conforme permissões |
| Agenda e atendimento | Agenda, agendamento online, recepção, caixa diário, fila, triagem, salas, lista de espera e painel de TV | Administrador, recepção, enfermagem e médico |
| Pacientes | Cadastro, busca, histórico, prontuário, retornos e portal do paciente | Administrador, recepção, enfermagem e médico |
| Clínica | Documentos clínicos, prescrições, atestados, encaminhamentos, sinais vitais, exames, templates clínicos e interoperabilidade FHIR | Administrador, médico e enfermagem, conforme permissões |
| Laboratório | Painel do laboratório, mapa de coleta, guias externas, laudos e liberação de resultados | Administrador, médico, enfermagem e recepção, conforme permissões |
| Financeiro | Visão financeira, contas a receber, contas a pagar, caixa, fluxo de caixa, preços e serviços, TISS/glosas, repasses médicos, inadimplência, relatórios, relatórios salvos e analytics | Administrador e financeiro |
| Suprimentos | Estoque, cadastro de itens, movimentações, compras e baixa pelo atendimento | Administrador e enfermagem |
| Gestão da clínica | Equipe e convites, convênios, configurações, configurações avançadas, automações, agente de IA, acesso assistido, segurança e solicitações LGPD | Administrador; financeiro/recepção em fluxos autorizados |
| Ajuda | Central de suporte, treinamento e documentação disponível à clínica | Equipe e administrador |

## Operação interna da plataforma SaaS

| Área | Módulos |
|---|---|
| Clientes e suporte | Clínicas, CRM, usuários da plataforma, central de suporte, feedbacks, onboarding de clínicas e acesso assistido |
| Produto e governança | Painel administrativo, governança de IA, comunicação global e documentação |
| Operação | Saúde da plataforma, controle operacional, integrações por clínica, filas/webhooks, incidentes, limites/consumo, domínios/DNS, relatórios agendados e backups |
| Segurança e privacidade | Central de segurança, LGPD da plataforma, logs/erros e auditoria de acesso assistido |
| Financeiro SaaS | Relatório executivo, cobranças SaaS e histórico financeiro |

## Rotas de compatibilidade

Os endereços antigos devem continuar encaminhando para o módulo atual: `/login`,
`/prescricoes`, `/atestados`, `/triagem`, `/encaminhamentos`, `/medicos`,
`/funcionarios`, `/salas`, `/lista-espera`, `/caixa`, `/caixa-diario`,
`/contas-receber`, `/contas-pagar`, `/pagamentos`, `/precos-exames`,
`/tipos-consulta` e `/templates-email`.

## Plano de validação

- [x] Build de produção (`npm run build`).
- [x] Suíte unitária e de componentes (`npm run test:run`).
- [x] Lint (`npm run lint`).
- [x] Verificações estáticas: colunas, falhas silenciosas, permissões e acessibilidade.
- [x] Testes locais de navegador Playwright (`npm run test:e2e`).
- [ ] Smoke tests autenticados por perfil e fluxos de ponta a ponta com Supabase.
- [ ] Aplicação e validação das migrações no banco de homologação.

## Resultados executados em 07/10/2026

| Verificação | Resultado | O que comprova |
|---|---|---|
| `npm run build` | Passou; 4.283 módulos transformados | O bundle de produção compila localmente. |
| `npm run test:run` | 70 arquivos e 640 testes passaram | Regras e componentes cobertos pelos testes unitários. |
| `npm run test:e2e` | 125 passaram; 44 foram pulados | Fluxos locais de navegador e renderização das rotas; os pulos dependem de contas/ambiente externo. |
| `npm run lint` | 0 erros; 1.729 avisos | Código sem erros bloqueantes de ESLint; há dívida de tipos `any`, dependências de hooks e Fast Refresh. |
| `npm run check:colunas` | Passou; 136 tabelas e 321 arquivos analisados | Nomes de colunas referenciados no código conferem com o esquema conhecido no repositório. |
| Checagem com esquema real da VPS (`SCHEMA_REAL` + `npm run check:colunas`) | Encontrou 1 tabela ausente | `Encaminhamentos.tsx` lê `encaminhamento_status_history`, que não existe no esquema público da VPS. |
| `npm run check:falhas` | Nenhum caso encontrado | O detector não encontrou padrões configurados; isso não substitui revisão de tratamento de erro. |
| `npm run check:permissoes` | Passou; 18 grupos, 70 itens de menu e 66 rotas protegidas | Menu e mapa de rotas concordam. O verificador também apontou observações informativas para conferir no produto. |
| `npm run check:a11y` | Passou | Nenhum controle sem nome acessível ou interativo aninhado no escopo do verificador. |

O modo E2E usa uma chave Supabase fictícia. Os dois testes da landing que verificam o console agora simulam a leitura pública de planos em `tests/mockPlanosPublicos.ts`; isso mantém esses testes locais e não os transforma em validação do catálogo real.

A comparação somente de leitura do esquema real encontrou 125 tabelas públicas na VPS. As migrations locais declaram 136 tabelas: 15 nomes declarados localmente não aparecem no banco e quatro tabelas existentes no banco não têm `CREATE TABLE` local. Isso é divergência de histórico/esquema; a comparação não prova que as 15 tabelas estejam todas em uso. A checagem detectou uma referência ativa no fluxo de encaminhamentos, descrita abaixo.

## Pendências de validação externa

| Pendência | Evidência necessária | Situação atual |
|---|---|---|
| Isolamento entre clínicas | Duas contas de teste em clínicas distintas e execução dos testes de isolamento | Os cenários foram pulados por ausência dessas contas. |
| Acesso por perfil | Contas de homologação para administrador, médico, recepção, enfermagem e financeiro | Os cenários RBAC foram pulados; checagem estática de menu não prova autorização no banco. |
| RLS e funções protegidas | Chave pública do ambiente de homologação e execução dos testes REST/Edge Function | Os testes dependentes do Supabase não foram exercitados nesta rodada. |
| Versão publicada | Definir `PRODUCAO_URL` e executar `tests/producao-smoke.spec.ts` | Smoke de produção ficou pulado; nenhum deploy foi feito nesta auditoria. |
| Migrações e esquema real | Aplicar o conjunto de migrações em homologação e comparar com o esquema efetivo | `check:colunas` é estático e não comprova que as migrações estão aplicadas. |
| Histórico de encaminhamentos | Aplicar e validar as migrations `20260414160000_add_referral_system.sql` e `20261008100000_registrar_historico_encaminhamentos.sql` em homologação | A tabela `encaminhamento_status_history` está ausente na VPS. Ao abrir o histórico de um encaminhamento, o fluxo exibe erro de carregamento até a migration ser aplicada. Não apliquei migration nesta rodada. |
| Integrações clínicas e comerciais | Contas/dados de teste para validar fluxos completos de agenda, prontuário, cobrança, WhatsApp e prescrição digital | Build e telas não comprovam o comportamento ponta a ponta dos provedores. |

## Achados corrigidos durante a auditoria

- O lint apontou um `let` que nunca era reatribuído e um `useMemo` chamado depois de retornos antecipados em `PlatformSeguranca`. Ambos foram corrigidos; lint e build passaram depois da correção.
- Dois testes de console da landing falhavam porque o modo E2E usava chave fictícia ao buscar o catálogo real de planos. A chamada foi isolada por mock nos próprios testes; os oito testes de autenticação e integridade da UI passaram, e a suíte completa também passou depois.
- A checagem real originalmente ignorava `.from('tabela')` quando a tabela não existia no esquema. Ela agora sinaliza esse caso quando recebe um snapshot real; a nova verificação localizou o histórico ausente de encaminhamentos. A aplicação da migration é necessária para restaurar o fluxo e ficou pendente por depender de homologação.
- Restam 1.729 avisos do ESLint, principalmente `any` explícito. Eles não falham o comando, mas aumentam o custo de detectar regressões de tipo e merecem redução gradual.

## Limite da evidência

Build e testes locais não comprovam políticas RLS, triggers, Edge Functions, integrações,
dados reais, credenciais nem permissões efetivas do Supabase. Esses itens precisam de
ambiente conectado e não devem ser tratados como aprovados apenas por testes de UI. A
matriz protegida do Playwright prova redirecionamento sem sessão e ausência de exceções
ao carregar cada rota; não prova os fluxos de negócio autenticados de cada módulo.
