# EloLab — andamento do Laboratório

Atualizado em 2026-10-10. Escopo restrito ao módulo Laboratório. Nenhuma alteração foi aplicada à VPS ou ao banco de produção. A migration permanece local e pendente de validação em Supabase de desenvolvimento.

## Implementado

- Pedidos agrupados integrados a pacientes, médicos, convênios e catálogo de exames.
- Mapa de coleta com eventos de rastreabilidade, rejeição e recoleta.
- Worklist por setor e perfis de exames com unidade, referência, método, preparo, tubo, prazo e custo.
- Gestão de setores, equipamentos, lotes e controle de qualidade.
- Indicadores operacionais e exportação CSV agregada.
- Resultados críticos, histórico versionado e retificação justificada com autorização no servidor.
- Guias terceirizadas com parceiro, prazo, custo, PDF privado e histórico de alterações.

## Validação local

- Teste focado de pedidos: 3/3 passou.
- Suíte geral previamente executada: 84 arquivos, 718 testes passaram; não repetida após alterações pontuais.
- Build, verificação de acessibilidade, permissões e falhas silenciosas passaram na rodada anterior; ESLint sem erros, com avisos any.
- TypeScript verificado após as últimas mudanças; git diff --check limpo.

## Bloqueios e próximos passos

- A migration/RLS e os fluxos ponta a ponta precisam de um PostgreSQL/Supabase isolado. Não há runtime local disponível nesta sessão; o projeto Supabase configurado aponta para produção e não foi usado.
- Intervalos de referência, preparo, tubos, valores críticos e autorização de retificação precisam de validação do responsável técnico da clínica.

Inventário detalhado: docs/LABORATORIO_PROGRESS.md.
