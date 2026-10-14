# Auditoria de UX, telas e oportunidades do EloLab

## Atualização de QA autenticado

Em 12/10/2026, uma sessão sintética local percorreu as 88 rotas protegidas da matriz Playwright, incluindo aliases e telas da plataforma, em Chromium desktop (1440 × 900). Todas passaram nas verificações de conteúdo principal, título H1 visível, ausência de exceções JavaScript e ausência de rolagem horizontal. As chamadas externas foram bloqueadas e as chamadas ao Supabase foram simuladas; nenhum dado de paciente ou conta real foi usado.

A varredura revelou títulos principais ausentes em Relatórios salvos e Cobrança de inadimplentes; ambos agora têm H1 visível. O painel de TV é uma tela independente e foi verificado pelo conteúdo do documento, fora do contêiner padrão. O teste não percorre fluxos de gravação/envio nem substitui uma inspeção visual manual de cada pixel; ações com efeito permanecem cobertas pelos testes de unidade específicos.

Data: 12/10/2026

## Escopo e limites

- Revisei as rotas em `src/App.tsx` e a matriz de navegação/perfis em `src/config/sidebarMenu.ts`: são 110 caminhos distintos no roteador; parte deles são aliases, redirecionamentos ou rotas repetidas entre os modos público e autenticado, não 110 telas independentes.
- Revisei a estrutura global em `src/components/layout/MainLayout.tsx`, o anúncio de navegação acessível, estados vazios encontrados nas páginas e a suíte de smoke test `tests/modulos.spec.ts`.
- A suíte Playwright enumera 88 rotas protegidas, 6 públicas e 3 larguras responsivas. O teste de rota protegida sem sessão confirma redirecionamento; não renderiza nem valida a interface autenticada.
- No Orca Browser, revisei a árvore acessível da página pública e da autenticação. O navegador incorporado estava em 575 × 1809 px. Não abri módulos clínicos autenticados porque isso carregaria dados reais de pacientes. Portanto, este relatório é uma auditoria abrangente de rotas/código e uma inspeção visual parcial, não uma certificação visual em desktop de cada tela autenticada.

## O que já está bem encaminhado

- `MainLayout` oferece link para pular ao conteúdo, navegação móvel em painel, foco e anúncio após troca de rota, indicador offline e uma barreira de erro por tela.
- O menu separa áreas por perfil e sinaliza recursos condicionados a plano. A rota `/fila` combina fila e triagem por abas, e `/recepcao` combina recepção e caixa, evitando telas paralelas desconectadas.
- A agenda, laboratório, contas, relatórios, pacientes e equipe já têm operações relevantes; várias listas distinguem ausência de registros de filtros sem correspondência.
- A página inicial pública apresenta módulos, planos, perguntas frequentes e chamadas para ação. A tela de login tem rótulos de campo, recuperação de senha e controle de visibilidade da senha.
- Estados vazios acionáveis foram adicionados recentemente em Relatórios Salvos, Risco de Faltas e Cobrança de Inadimplentes.

## Achados prioritários

### P1 — Falta uma verificação de interface autenticada por módulo

`tests/modulos.spec.ts` cobre o redirecionamento sem sessão, não o conteúdo que o usuário vê depois do login. Assim, uma rota pode redirecionar corretamente e ainda abrir vazia, com erro, abas sem conteúdo ou layout quebrado para o perfil permitido.

**Melhoria:** criar um ambiente de QA isolado com clínica e dados sintéticos. Para cada perfil, abrir suas rotas permitidas em Chromium desktop (1440 × 900) e tablet. Validar título principal, conteúdo carregado, ausência de erro, overflow horizontal, controles acessíveis e ações primárias. Usar dados fictícios; não conectar o teste de UI a uma clínica real.

### P1 — Hierarquia e nomes de página não são centralizados

O login público mostra “Acesse sua conta” como título nível 2, sem nível 1. `RouteAccessibility` mantém rótulos explícitos para apenas parte das rotas e gera os demais a partir do slug; isso tende a produzir nomes sem acento e nomes técnicos em rotas administrativas e aliases.

**Melhoria:** exigir um título principal único por página (incluindo telas compostas por abas), mapear todos os nomes de rota em uma fonte comum e usar o mesmo texto em título visual, breadcrumb, anúncio de leitor de tela e título do documento.

### P1 — O sistema visual está espalhado em valores locais

Há 289 valores hexadecimais distintos em arquivos TSX. Alguns tons de marca se repetem bastante (`#0c1f54`, `#005ecc`, `#eaf4ff`), mas muitas variações de borda, fundo e texto são definidas diretamente por tela.

**Melhoria:** consolidar tokens semânticos para marca, superfície, borda, sucesso, atenção, erro, risco e foco. Padronizar cabeçalhos de página, barra de filtros, tabelas, cartões de métrica, estados de carregamento e vazios. Manter cores clínicas de alerta com contraste validado e significado consistente.

### P1 — Falta um mapa de jornadas entre módulos

O menu agrupa funcionalidades, mas a experiência pode depender de o usuário saber qual módulo abrir em seguida. O fluxo que liga agendamento, recepção, fila, prontuário, exame/laudo e conta é especialmente sensível a trocas de contexto e perfis.

**Melhoria:** acrescentar uma faixa contextual de “próxima etapa” nos registros e filas: confirmar chegada → chamar → atender → solicitar/acompanhar exame → finalizar. Mostrar somente ações autorizadas ao perfil e preservar o contexto ao navegar entre telas.

### P2 — Há rotas antigas que aumentam a ambiguidade

O roteador mantém aliases como `/caixa`, `/caixa-diario`, `/contas-receber`, `/pagamentos`, `/medicos`, `/funcionarios`, `/templates` e outros. É útil manter links antigos funcionando, mas cada alias precisa chegar à aba correta e aparecer de forma coerente em breadcrumb, título e anúncio de rota.

**Melhoria:** manter redirecionamentos compatíveis, centralizar o destino canônico, testar query string/aba ativa e garantir que menus e chamadas novas usem apenas a rota canônica.

### P2 — Estados vazios pedem um padrão único de decisão

O código já contém bons exemplos, mas a apresentação varia entre texto simples, texto em tabela, ícone e cartões. Uma lista vazia por primeira utilização não deve parecer igual a uma busca sem resultados, falha de rede, falta de permissão ou filtro restritivo.

**Melhoria:** em cada lista, padronizar quatro estados: carregando, erro com tentar novamente, primeira utilização com ação segura, e filtro sem resultados com limpar filtros. Em módulos clínicos, explicar a origem do dado e evitar sugerir ações que alterem prontuários ou enviem comunicação sem intenção explícita.

### P2 — A tela de login tem dois controles com o mesmo nome “Entrar”

Na árvore acessível, “Entrar” aparece como aba/alternância de modo e também como botão de envio. Embora funcionem em contextos diferentes, nomes idênticos dificultam a navegação por leitor de tela.

**Melhoria:** dar nomes distintos como “Modo de acesso: entrar” e “Enviar acesso”, e garantir nível de título 1 na página. Revisar também o banner de cookies para que não cubra o formulário em telas menores.

### P2 — A promessa comercial deve levar a uma decisão informada

A página pública explica que o teste grátis pede cartão e começa cobrança recorrente após três dias, além de falar de segurança, migração, suporte e limites. Esses pontos são importantes para conversão e confiança.

**Melhoria:** tornar preço, data da primeira cobrança, cancelamento, escopo de migração, limites por plano e canais/prazos de suporte comparáveis antes do checkout. Usar texto de segurança que descreva controles verificáveis e link direto para detalhes de privacidade e retenção.

## Melhorias de produto adicionais

1. **Central de trabalho por perfil:** resumo de tarefas pendentes, consultas próximas, exames atrasados e contas em atenção, com filtros por unidade/período e atalhos autorizados.
2. **Linha do tempo operacional do paciente:** eventos clínicos e administrativos com origem, horário e responsável, mantendo permissões e trilha de auditoria; evitar duplicar dados ou misturar cobranças do plano EloLab com o financeiro da clínica.
3. **SLA do laboratório:** tempo entre coleta, recebimento, processamento e liberação, com alertas de atraso configuráveis e visão por setor.
4. **Busca global orientada a tarefa:** encontrar paciente, consulta, exame, tarefa ou módulo com indicação do tipo de resultado e sem expor dados além do perfil.
5. **Preferências de densidade e acessibilidade:** alto contraste, tamanho de texto e densidade de tabela, sem mudar significado de cor nem esconder controles.
6. **Ajuda contextual:** explicar termos de faturamento/TISS, risco de falta, status de exames e permissões junto ao campo, com link para documentação curta e atualizada.

## Continuação — preferências e jornada

- O formato curto de data foi ligado às datas de nascimento e à linha do tempo do paciente; a preferência é aplicada no shell e mantém o formato ISO selecionado pelo usuário. A configuração esclarece que outros módulos ainda usam o formato local.
- O controle de resumo por e-mail foi substituído por uma mensagem de indisponibilidade, para não sugerir que exista envio automático.
- A jornada atual já passa contexto de paciente/agendamento entre recepção, triagem, fila e prontuário. O próximo refinamento concreto é acrescentar ações contextuais seguras aos eventos da linha do tempo e ampliar a preferência de data módulo a módulo.
- Validação desta continuação: TypeScript passou; 42 testes de formatadores e preferências passaram; teste E2E da preferência em tablet passou.

## Plano recomendado

1. Completar a suíte visual com ambiente de QA isolado e perfis sintéticos; executar a matriz de módulos em desktop/tablet.
2. Resolver título único, nomes de rota, foco e estados acessíveis; priorizar telas de operação diária.
3. Consolidar tokens e componentes de tabela, filtros, cabeçalho, formulários e estados.
4. Refinar as jornadas de atendimento e laboratório com ações contextuais e trilha de auditoria.
5. Priorizar novas funções por frequência de uso, redução de retrabalho e impacto clínico/financeiro; validar cada proposta com usuários da clínica antes de ampliar o escopo.

## Veredito

O produto já tem cobertura funcional ampla e boas bases de navegação/acessibilidade. O maior ganho agora vem de verificar visualmente os módulos autenticados num ambiente sintético, unificar o sistema visual e encadear melhor as tarefas entre atendimento, clínica, laboratório e financeiro. As sugestões de produto devem entrar depois dessa base de consistência e de testes confiáveis.

## Execução do plano — 12/10/2026

- Varri as 88 rotas protegidas em Chromium desktop (1440 × 900) e tablet (768 × 1024), com uma sessão e backend sintéticos: ambas passaram verificando título H1 visível, conteúdo, erros JavaScript, respostas de acesso negado e overflow horizontal.
- Testei os perfis recepção, médico, enfermagem e financeiro em telas permitidas e negadas; também confirmei que uma conta administradora da clínica não acessa áreas exclusivas da plataforma. Os cinco testes de autorização e o teste da busca global passaram.
- Testei 15 aliases/redirecionamentos e preservação das abas canônicas. Resultado: 1 teste passou.
- A busca global agora inclui mais módulos, aponta Contas a receber para `/contas?tab=receber`, restringe destinos pelo perfil e normaliza acentos também no filtro interno do componente. O teste de busca sem acento passou.
- Preferências de alto contraste e texto ampliado agora alteram a interface; a página inicial configurada redireciona a partir do dashboard e respeita as permissões do perfil. A interação foi testada no tablet e salvou apenas no backend interceptado.
- Relatórios Salvos e Cobrança de Inadimplentes receberam cabeçalho compartilhado com H1. A centralização de nomes de rota, o anúncio acessível, estados vazios e os respectivos testes também foram implementados.
- TypeScript: `npx tsc --noEmit` passou. Testes unitários/focados: 8 arquivos e 12 testes passaram.
- O detector Impeccable sinalizou fonte Inter, texto em gradiente e animações de bounce já presentes na folha global. Como são padrões globais anteriores a este refinamento, não os alterei nesta execução para preservar o sistema visual estabelecido.

### Itens que ainda exigem produto/infraestrutura

- `date_format` agora altera o formato curto nas datas de nascimento e na linha do tempo do paciente; outras datas e horários continuam usando o formato local atual. O resumo diário por e-mail permanece indisponível e a tela informa que nenhum e-mail será enviado.
- A migration `supabase/migrations/20261012130000_user_preferences_accessibility.sql` foi criada para persistir alto contraste e tamanho de texto; permanece **não aplicada**. Nenhuma migration ou deploy foi executado.
- A varredura automatizada confirma estrutura e responsividade nas duas larguras, mas não certifica cada detalhe visual em todos os módulos nem valida fluxos destrutivos/envio com dados reais. O cenário usa apenas respostas sintéticas e não controla a aba ativa do Orca.

### Melhorias priorizadas para a próxima entrega

1. Expandir o formato de data aos demais módulos com revisão contextual de datas e horários. Só ativar resumo por e-mail quando houver rotina de envio e configuração verificáveis.
2. Fazer revisão visual assistida por captura de tela das rotas mais usadas em desktop/tablet, corrigindo problemas encontrados sem reabrir dados reais.
3. Ampliar a jornada contextual entre agendamento, recepção, fila, prontuário, exames e contas, com preservação do contexto e ações permitidas por perfil.
4. Consolidar cabeçalhos e estados vazios gradualmente nos módulos restantes, guiado por uma revisão visual, sem uma migração estética global.

## Continuação da execução — cobertura visual e preferências

- A preferência de data agora é aplicada aos padrões numéricos de `date-fns` em 39 arquivos TSX e aos formatadores compartilhados; chaves ISO usadas em filtros e integrações permanecem estáveis. Datas por extenso e horários localizados continuam no formato local. A descrição da preferência esclarece esse limite.
- A linha do tempo do paciente ganhou atalhos para prontuário, exames e triagem, com destinos condicionados ao perfil e validação do identificador do agendamento.
- A lista de pacientes usa cartões até a largura desktop (`lg`), evitando tabela cortada em tablet. A captura sintética em 768 px confirma que nome, contato e ações cabem na tela.
- A landing page deixa de anunciar período grátis quando o plano não oferece teste e mostra a duração configurada. No checkout, duração enviada, consentimento e estimativa de primeira cobrança agora seguem os dias configurados no plano, sem valor fixo de três dias. A copy foi conferida com a [documentação oficial de planos com teste grátis do Mercado Pago](https://www.mercadopago.com.br/developers/pt/docs/subscription-plans/create-subscription-plan). Nenhum fluxo de cobrança foi executado nesta validação.
- A captura automatizada registra nove telas principais em desktop (1440 × 900) e tablet (768 × 1024), somente com dados sintéticos. As imagens ficam nos artefatos de `test-results` e não incluem dados de pacientes reais.
- Validação desta continuação: TypeScript passou; os cinco arquivos de testes focados passaram (53 testes); a captura das nove telas passou; as 88 rotas passaram em desktop e tablet; o teste E2E de preferências passou. O detector Impeccable não apontou novos itens nos arquivos revistos.

## Próxima entrega executada — estados vazios operacionais

- Fila, Tarefas e Worklist do Laboratório passaram a usar `ActionableEmptyState`, com título, orientação e ação contextual.
- Tarefas distingue primeira utilização de busca/filtro sem resultados: oferece criar a primeira tarefa ou limpar a busca e os filtros.
- Fila preserva a distinção entre fila realmente vazia e atendimentos bloqueados aguardando liberação; o texto informa por que não é possível chamar e oferece o fluxo de adicionar paciente que já chegou.
- Worklist do laboratório orienta a ampliar o período, carregar outros registros, limpar filtros ou criar coleta, conforme o estado. Não incentiva alteração de amostra existente.
- O componente anuncia mudanças com `role="status"` e `aria-live="polite"`. Capturas sintéticas conferiram estados e botões nas três telas em 1440 × 900 e 768 × 1024.
- Validação: TypeScript passou; os testes do componente compartilhado e da landing passaram (6 testes); captura das nove telas em desktop/tablet passou. Os testes não escrevem em backend real.

## Continuação — listas de pacientes e exames

- A lista de pacientes usa o estado compartilhado tanto no layout de cartões quanto na tabela desktop. Diferencia consulta pendente, clínica sem cadastros, busca sem resultados e indisponibilidade dos indicadores.
- O botão de cadastro no estado inicial só é mostrado a perfis com permissão existente (`admin` e `recepção`); um filtro sem resultado oferece limpar busca/filtros.
- A lista de exames apresenta orientação quando ainda não há solicitações, com atalho para uma nova guia. Quando os filtros escondem resultados, oferece removê-los. O identificador de paciente continua preservado ao abrir a nova guia.
- A captura sintética passou a cobrir dez telas em 1440 × 900 e 768 × 1024, incluindo o estado inicial de Exames. Testes do estado de pacientes e do componente compartilhado passaram (4 testes); TypeScript passou.

## Correções do QA visual — responsividade e captura por rolagem

- Exames passou a usar uma grade progressiva de indicadores (2 colunas em celular, 3 em tablet e 5 em desktop); o rótulo “Laudo Disponível” não quebra no cartão.
- Laboratório agora organiza os seis indicadores em 2 colunas no celular, 3 em tablet e 6 em telas XL. Os filtros da worklist usam grade em larguras menores; o contador fica alinhado com setor/período e não forma uma linha isolada.
- A captura visual rola o `main#main-content` interno em segmentos de altura de viewport, captura cada trecho e retorna ao início antes da próxima rota. A asserção garante que Laboratório tem trecho além da primeira dobra. O material fica em `test-results`.
- QA visual final: captura de dez telas em desktop (1440 × 900) e tablet (768 × 1024) passou; verificações de número de colunas e alinhamento do contador também passaram. TypeScript passou e os testes focados passaram (6 testes).

### Limites que continuam pendentes

- O resumo diário por e-mail permanece explicitamente indisponível, pois o app não tem serviço de envio/scheduler configurado para esse recurso.
- A migration de preferências continua criada, mas não aplicada; nenhuma migration, deploy ou alteração em produção foi feita.
- A consolidação dos valores visuais locais, a padronização de estados vazios e a revisão assistida de todas as rotas ainda são trabalho gradual. O detector global anterior segue apontando padrões preexistentes de fonte Inter, texto em gradiente e animações bounce; não foi feita troca estética ampla sem validação de produto.
- Capturas automatizadas verificam estrutura e responsividade, não substituem avaliação visual de cada uma das 88 rotas nem testes destrutivos/financeiros. Nenhuma tela ativa do Orca foi controlada.
