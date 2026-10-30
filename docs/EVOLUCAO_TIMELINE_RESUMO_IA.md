# Histórico do paciente — resumo clínico em tela própria

## Diagnóstico atual

O resumo inteligente era aberto em um diálogo rolável que cobria a linha do tempo. Em telas pequenas, o profissional perdia o contexto da ficha e precisava fechar o overlay para voltar à tarefa anterior. Uma URL aberta diretamente também não tinha uma orientação clara quando o resumo, mantido apenas em memória, não estava disponível.

## Jornada e direção

- Objetivo: consultar uma síntese de apoio e voltar ao mesmo histórico sem perder busca, filtros ou paciente.
- Perfil: profissional autorizado a consultar o histórico clínico.
- Entrada: ação “Resumo clínico IA” na linha do tempo.
- Continuidade: a URL recebe `timeline=summary`; o resumo fica na memória da tela e o foco vai para o título.
- Saída: “Voltar ao histórico” remove apenas o parâmetro da etapa, restaura o foco para a ação de origem e mantém os demais parâmetros e filtros.
- Link direto/recarregado: a tela informa que não há conteúdo nesta sessão e oferece geração explícita. Nenhuma síntese é persistida na URL, em storage do navegador ou em registros clínicos.
- Exceção: falha na geração mostra recuperação e permite tentar novamente; o histórico continua acessível.

## Implementação e preservação

- `PatientTimeline` substitui o diálogo por uma área de leitura sem limite de altura, com estado de carregamento, falha, vazio e conteúdo.
- A advertência explica que a síntese pode omitir ou interpretar incorretamente informações e não substitui prontuário nem avaliação profissional.
- A função existente `patient-clinical-summary`, a autorização/auditoria do histórico, o identificador do paciente e o comportamento de revisão humana foram preservados.
- Pacientes seleciona a aba de histórico em links diretos e mantém estável a consulta da ficha durante mudanças de etapa na URL; isso evita desmontar conteúdo sensível em memória.
- Prontuários controla a aba Timeline para abrir links diretos no contexto do paciente.
- A navegação só libera a mudança isolada de `timeline=summary` quando caminho e demais parâmetros permanecem iguais.
- Não houve alteração de backend, modelo, permissões, contrato de API, dados, migration ou cobrança.

## Validação

- Vitest focado, incluindo autorização da função e navegação: 12/12 passaram.
- Playwright do histórico do paciente: 1/1 passou; cobre geração sintética, foco, busca preservada, ausência de diálogo, link direto/recarregado e rolagem no celular.
- TypeScript sem erros; build de produção passou.
- ESLint focal: 0 erros; avisos existentes de `any` em arquivos grandes de Pacientes, Prontuários e Histórico.
- `check:a11y`, `check:permissoes`, `check:falhas`, `check:colunas` e `git diff --check` passaram.
- Capturas efetivamente inspecionadas em 1440×900 e 375×812. A tela mantém contraste, não apresenta rolagem horizontal, deixa a advertência legível após rolagem e mantém o conteúdo acima da navegação fixa. As respostas são sintéticas; nenhuma chamada clínica real foi feita no teste.

## Arquivos

- `src/components/clinical/PatientTimeline.tsx`
- `src/pages/Pacientes.tsx`
- `src/pages/Prontuarios.tsx`
- `src/components/clinical/__tests__/PatientTimeline.test.tsx`
- `src/lib/patientTimelineSummaryNavigation.ts`
- `src/lib/__tests__/patientTimelineSummaryNavigation.test.ts`
- `tests/ux-visual-synthetic.spec.ts`

## Publicação

Commit `db8b582e3304a47bc68b574e9af5a4bc012bedf8`; imagem `easypanel/elolab/app:deploy-20261030-db8b582`. O smoke isolado respondeu `ok` e `/version.json` confirmou o SHA integral. O Swarm concluiu com 1/1 réplica; `/healthz` público respondeu `ok` e a versão pública confirmou o mesmo `build_id`. A porta host apresentou contenção transitória durante o rollout e o serviço convergiu sem rollback. Rollback preservado: `deploy-20261030-df8c0c1`; fonte anterior em `code.before-20261030-db8b582`. Nenhuma migration ou escrita de dados de produção.
