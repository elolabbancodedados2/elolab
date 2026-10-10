# EloLab — progresso da reconstrução do Laboratório

## Objetivo e limites

Reconstruir o módulo Laboratório como um LIS integrado ao EloLab, cobrindo operação, pedidos, coleta, amostras, processamento, resultados, laudos, encaminhamentos externos e gestão laboratorial. O trabalho fica restrito a Laboratório e integrações necessárias. Não alterar o site, outros módulos nem produção. Migrações podem ser escritas no repositório, mas não serão aplicadas à VPS sem autorização explícita.

Preservar todas as alterações preexistentes e não commitadas de outras sessões. No início deste trabalho, as mudanças locais em `MainLayout.tsx`, componentes UI globais, `index.css`, Auth, Dashboard e assets/anúncio 2.0 são preexistentes e estão fora do escopo.

## Inventário inicial (2026-10-10)

- Entradas existentes e que serão mantidas: `/laboratorio`, `/mapa-coleta`, `/guias-externas`, `/laudos-lab`.
- Implementações existentes: `Laboratorio.tsx` (painel/worklist e fluxo básico de registro), `MapaColeta.tsx`, `GuiasExternas.tsx`, `LaudosLab.tsx`, portal de guias públicas e `GerenciadorLaboratorios.tsx`.
- Integrações já presentes: Supabase Auth/perfil, clínica, pacientes, médicos, convênios, exames, coletas, resultados, arquivos privados de guias e portal tokenizado.
- Tabelas principais identificadas: `exames`, `coletas_laboratorio`, `resultados_laboratorio`, `laboratorios`, `tipo_exames_catalog`, `guias_externas`, `portal_guias_tokens`.
- `exames` já representa solicitações individuais; não duplicar cadastro nem substituir dados. A estrutura atual ainda não fornece agrupamento completo de pedidos com múltiplos exames, eventos rastreáveis de amostras, revisão imutável de resultados, equipamentos, lotes/reagentes e controle de qualidade.
- Há controles de escopo por clínica em algumas consultas e políticas RLS existentes. Revisar e reforçar o isolamento das tabelas novas e dos fluxos tocados; nunca confiar apenas no filtro do frontend.
- Os quatro arquivos de tela são extensos e misturam consultas, mutações e apresentação. Evoluir por etapas mantendo as rotas e operações atuais compatíveis.

## Plano incremental

1. **Fundação segura e progresso** — inventariar contratos atuais, definir modelos compartilhados e migração PostgreSQL aditiva com clínica, permissões, índices e auditoria; preservar compatibilidade com dados atuais.
2. **Painel e pedidos** — redesenhar o painel operacional; pedidos agrupados/múltiplos exames, prioridade, convênio, origem, médico e histórico.
3. **Coleta e rastreabilidade** — agenda/preparo/etiquetas; eventos de recebimento, transporte, armazenamento, rejeição e recoleta, preservando mapa atual.
4. **Processamento e resultados** — worklist por setor, resultados estruturados, unidade/referência, revisão, alterações versionadas e alertas críticos.
5. **Laudos e guias externas** — versões, PDF, retificação, autorização de liberação, compartilhamento seguro e acompanhamento de parceiro sem quebrar o portal existente.
6. **Gestão, qualidade e indicadores** — equipamento, insumos/lotes, controle de qualidade, prazos, produtividade, custos e relatórios.
7. **Verificação** — testes focados em fluxos/RLS, integração, acessibilidade aplicável, lint, TypeScript, build e verificações de segurança; documentar limitações e itens que dependem de validação clínica/regulatória.

## Andamento

- [x] Inventário inicial de rotas, arquivos, tabelas e integrações.
- [x] Identificado o estado e preservadas as alterações preexistentes fora do escopo.
- [x] Fundação de dados aditiva, com RLS e auditoria (migration criada localmente; não aplicada).
- [x] Painel operacional e pedidos agrupados, vinculados a pacientes, médicos, convênios e catálogo existentes.
- [x] Rastreabilidade de amostras para recebimento, transporte, armazenamento, rejeição e recoleta; mapa existente preservado.
- [x] Inclusão de resultados sinalizados como críticos e preparação de histórico versionado via trigger.
- [x] Gestão inicial de setores, equipamentos, calibração, lotes de insumos e controle interno de qualidade.
- [x] Indicadores operacionais iniciais de volume, liberação, prazo, recoletas e custos registrados, com CSV agregado.
- [x] Integrar histórico versionado e revisão/retificação diretamente à tela de laudos; a validação clínica de PDFs e assinatura permanece pendente.
- [x] Worklist por setor e resultados estruturados com unidades/referências parametrizadas pelo laboratório.
- [ ] Exercício de ponta a ponta num Supabase de desenvolvimento isolado (runtime local de PostgreSQL indisponível nesta sessão).
- [x] Suíte geral local (84 arquivos, 718 testes).
- [x] TypeScript, build, acessibilidade, permissões, falhas silenciosas e lint nas telas alteradas.

## Decisões e limites clínico-regulatórios

- Nenhum dado clínico fictício será inserido como fallback. Estados sem dados devem explicar a ausência e permitir ação real.
- Revisões e eventos serão registrados sem apagar o histórico clínico.
- PDF/assinatura não serão apresentados como assinatura digital ICP-Brasil nem como conformidade regulatória sem integração e validação específicas.
- A clínica deve validar nomenclaturas, tubos, preparo, intervalos de referência, valores críticos, retenção de amostras e regras de assinatura antes do uso assistencial.

## Última atualização

2026-10-10 — implementados também catálogo parametrizável, atribuição por setor, perfis com custo, guias com parceiro e eventos, e retificação auditada de resultados. Teste focado de pedidos passou (3/3); TypeScript e `git diff --check` passaram após as últimas mudanças. Build, acessibilidade, permissões e falhas silenciosas passaram na rodada anterior; ESLint sem erros (avisos `any`). A suíte geral anterior passou (84 arquivos/718 testes). Migration/RLS seguem sem execução e sem validação em PostgreSQL isolado. Nada foi enviado ao GitHub ou implantado.
