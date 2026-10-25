# EloLab Mobile Nativo — plano de implementação

> **Para agentes de implementação:** executar as tarefas em ordem e marcar cada entrega. Este plano implementa `docs/MOBILE_APP_SPEC.md`.

**Objetivo:** substituir o invólucro WebView por um app nativo React Native completo para Android e iOS, mantendo os módulos e acessos existentes.

**Arquitetura:** `expo-mobile/` será um app Expo Router separado. Ele usará um cliente Supabase próprio com persistência nativa, componentes React Native e navegação mobile. Reutilizará o backend existente e seguirá os papéis, planos e RLS atuais; não compartilhará componentes DOM.

**Tecnologia:** Expo SDK 58, React Native 0.88, Expo Router, TypeScript, Supabase JS e TanStack Query quando necessário.

**Especificação:** `docs/MOBILE_APP_SPEC.md`.

## Restrições globais

- Consultar documentação versionada Expo SDK 58 antes de usar APIs Expo ou React Native.
- Manter `expo-mobile/` independente da aplicação Vite.
- Chaves no cliente devem ser publishable; nenhum segredo ou chave `service_role` pode entrar no bundle.
- Preservar RLS, papéis, planos, Edge Functions e dados existentes. Não criar migration nem tocar produção.
- Aplicar `DESIGN.md`: violeta para ações, azul-noite para estrutura, neutros frios, estados semânticos e Manrope.
- Todas as telas do produto devem ser nativas; a WebView do protótipo será removida.
- Não criar ou executar testes nesta tarefa; validar com typecheck, lint e inspeção no emulador.

## Foco de revisão

- Sem variáveis de ambiente: mostrar configuração ausente sem dados de exemplo ou erro silencioso. Verificar estado inicial da aplicação.
- Usuário sem clínica, papel ou entitlement: limitar rotas e dados como os guardas web. Verificar menu e deep links.
- Expiração de sessão ou falha de rede: permitir autenticação/recuperação sem exibir dados antigos de outro usuário.
- Telas com nomes, datas e valores longos: permitir leitura sem corte e com suporte a fonte ampliada.
- Formulários clínicos e financeiros: evitar submissão duplicada e manter validação/error states antes de escrita.

## Mapa de arquivos

- `expo-mobile/src/app/`: layouts, grupos de abas e rotas Expo Router.
- `expo-mobile/src/theme/`: tokens mobile derivados de `DESIGN.md`.
- `expo-mobile/src/components/`: cabeçalho, lista, campo, botão, badge, estados e navegação reutilizáveis.
- `expo-mobile/src/features/`: telas agrupadas pelos domínios do EloLab.
- `expo-mobile/src/lib/`: Supabase, autenticação, query client, formato e helpers independentes de UI.
- `expo-mobile/.env.example`: nomes das variáveis públicas necessárias, sem valores reais.
- `docs/MOBILE_APP_SPEC.md`: escopo, decisões e critérios de aceite.

## Fase 1 — fundação nativa

### Tarefa 1: roteamento, sessão e shell

**Arquivos:** `expo-mobile/package.json`, `expo-mobile/app.json`, `expo-mobile/app/_layout.tsx`, `expo-mobile/app/(auth)/login.tsx`, `expo-mobile/app/(tabs)/_layout.tsx`, `expo-mobile/src/lib/supabase.ts`, `expo-mobile/src/auth/`.

- [x] Instalar Expo Router, AsyncStorage, polyfill URL, Supabase JS, safe-area e dependências Expo compatíveis pelo `expo install`.
- [x] Configurar Expo Router e layouts de autenticação/abas segundo os docs do SDK 58.
- [x] Criar cliente Supabase nativo com `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; falhar com mensagem clara quando ausentes.
- [x] Implementar login, cadastro, recuperação de senha, confirmação reenviável, rate limit, MFA TOTP, ativação de convite, carregamento de sessão, logout e proteção de rotas sem reduzir exigências de backend. Links de autenticação nativos e troca de clínica continuam pendentes.
- [x] Criar abas Início, Agenda, Pacientes, Atendimento e Mais com navegação nativa.
- [x] Verificar `npx expo lint`, `npx tsc --noEmit` e abrir login no `Orca_Android` sem carregar a WebView.

### Tarefa 2: tokens e componentes móveis

**Arquivos:** `expo-mobile/src/theme/tokens.ts`, `expo-mobile/src/components/Screen.tsx`, `AppHeader.tsx`, `ActionButton.tsx`, `SearchField.tsx`, `StatusBadge.tsx`, `EmptyState.tsx`, `LoadingState.tsx`.

- [ ] Codificar tokens de cor, tipo, raio e espaçamento da especificação.
- [ ] Criar componentes nativos com estados de toque, foco, desabilitado, erro e acessibilidade.
- [ ] Mostrar cada componente em telas reais da fase 2 e verificar no emulador.
- [ ] Rodar lint e typecheck Expo.

## Fase 2 — trabalho diário da clínica

### Tarefa 3: início e agenda

**Arquivos:** `expo-mobile/src/features/home/`, `expo-mobile/src/features/agenda/`, `expo-mobile/app/(tabs)/index.tsx`, `expo-mobile/app/(tabs)/agenda.tsx`, rotas de detalhes.

- [ ] Criar resumo do dia com próximos atendimentos, fila e tarefas acionáveis. **Parcial:** início mostra os cinco próximos atendimentos reais do dia, por clínica e médico, com abertura do detalhe; fila e tarefas ainda pendentes.
- [ ] Portar agenda para lista diária/semanal e filtros por profissional/status, com detalhe e ações de agendamento. **Parcial:** agenda nativa conectada ao Supabase com navegação semanal, filtros por status/profissional, check-in médico e detalhe do atendimento com atalhos para paciente e triagem. Criar/editar usam busca paginada, verificação de conflito, bloqueios e expediente; cancelar chama a RPC auditada, remove da fila, exige um dos motivos oficiais e preserva o histórico. Seleção de sala e lembrete WhatsApp seguem pendentes.
- [ ] Reutilizar tabelas, queries, regras e validações existentes; preservar escopo da clínica e papel.
- [ ] Verificar listas vazias, erro/retry e toque no emulador; rodar lint e typecheck.

### Tarefa 4: pacientes e atendimento

**Arquivos:** `expo-mobile/src/features/patients/`, `expo-mobile/src/features/care/`, `expo-mobile/app/(tabs)/patients.tsx`, rotas para perfil, fila, triagem e recepção.

- [ ] Portar busca/lista, cadastro e perfil de paciente com histórico essencial. **Parcial:** busca usa os RPCs paginados existentes e respeita o perfil financeiro/clínico; perfil nativo mostra cadastro básico e consultas paginadas, e bloqueia detalhe para perfis exclusivamente financeiros; cadastro nativo cobre dados pessoais, endereço, convênio, lembretes, responsável e alertas, usa datas DD/MM/AAAA e revisa duplicidades. Edição clinic-scoped exige `updated_at`, preserva demais campos e sincroniza comorbidades pela RPC. Admin/recepção podem ativar ou inativar pela RPC auditada com motivo; a política bloqueia casos com fila ou consultas futuras. Enfermagem pode cadastrar, mas a edição fica limitada conforme a RLS. Leitura do prontuário é auditada; fluxo nativo de exames segue pendente.
- [ ] Portar fila, triagem, check-in/recepção, salas e espera para fluxos em tela cheia com ações explícitas. **Parcial:** fila do dia ordenada por prioridade e chamada com atualização condicional; triagem lista somente check-ins ativos ainda não triados; formulário nativo registra sinais vitais e risco, evita duplicidade e atualiza a prioridade pela RPC existente; início e finalização usam as transições atômicas existentes, com seleção de retorno e cobrança aplicada pelo banco; médicos podem registrar check-in atômico com cobrança pendente para confirmação da recepção. Check-in e confirmação de cobrança dos demais perfis, notificação de conclusão ao paciente, salas e espera seguem pendentes.
- [ ] Preservar validações, permissões, confirmações, logs e regras de escrita.
- [ ] Verificar tarefas principais no emulador; rodar lint e typecheck.

## Fase 3 — clínica, laboratório e operação

### Tarefa 5: prontuário e documentos clínicos

**Arquivos:** `expo-mobile/src/features/records/`, `expo-mobile/src/features/documents/`, `expo-mobile/src/features/exams/`.

- [ ] Portar prontuários, sinais vitais, documentos, receitas, atestados, encaminhamentos, exames e segurança assistencial. **Parcial:** leitura paginada e clinic-scoped para admin/médico registra a autorização de consulta e audita a abertura de cada evolução. O app mostra anamnese, sinais vitais, avaliação, conduta e prescrições; cria/edita rascunhos com controle de versão e salvamento automático remoto; assina somente ao reabrir uma versão salva, via RPC verificável, e oferece conferência pública do hash sem expor dados do paciente. Adendos imutáveis exigem o médico autor com CRM ativo e são registrados pela RPC auditada. Fluxo de exames, anexos e outros documentos clínicos ainda pendentes.
- [ ] Adaptar formulários a teclado, toque e salvamento; manter acesso por papel e plano.
- [ ] Verificar estados de leitura/edição no emulador; rodar lint e typecheck.

### Tarefa 6: laboratório, estoque e equipe

**Arquivos:** `expo-mobile/src/features/lab/`, `expo-mobile/src/features/inventory/`, `expo-mobile/src/features/team/`.

- [ ] Portar painel laboratorial, coleta, guias e laudos.
- [ ] Portar estoque, equipe, profissionais e convites.
- [ ] Manter filtros, estados e escopos de acesso do web.
- [ ] Verificar fluxos nos dispositivos móveis; rodar lint e typecheck.

## Fase 4 — finanças e gestão

### Tarefa 7: financeiro e relatórios

**Arquivos:** `expo-mobile/src/features/finance/`, `expo-mobile/src/features/reports/`.

- [ ] Portar caixa, contas, cobranças, repasses, faturamento de convênios, preços e relatórios.
- [ ] Reutilizar regras e APIs existentes sem alterar `pagamentos_mercadopago`, `lancamentos` nem o checkout dos planos.
- [ ] Verificar valores, estados e papel financeiro no emulador; rodar lint e typecheck.

### Tarefa 8: comunicação, tarefas, automação e configurações

**Arquivos:** `expo-mobile/src/features/communication/`, `tasks/`, `automation/`, `settings/`, `support/`.

- [ ] Portar chat, notificações, tarefas, automações, agente de IA, perfil, configurações e suporte.
- [ ] Preservar entitlements, escopos e confirmações de ações administrativas.
- [ ] Verificar estados com/sem conteúdo; rodar lint e typecheck.

### Tarefa 9: administração da plataforma e cobertura de rotas

**Arquivos:** `expo-mobile/src/features/platform/`, `expo-mobile/src/navigation/`, `expo-mobile/app/`.

- [ ] Portar módulos de clientes/plataforma e telas auxiliares da especificação com permissão `somentePlataforma`.
- [ ] Mapear cada rota de produto de `src/App.tsx` para uma rota nativa ou redirecionamento documentado.
- [ ] Conferir catálogo do menu por papel/plano e acesso por deep link.
- [ ] Rodar lint/typecheck e revisar as principais rotas no `Orca_Android`.

## Fase 5 — pronto para distribuição

### Tarefa 10: acabamento de dispositivo e build

**Arquivos:** `expo-mobile/app.json`, `expo-mobile/eas.json` se necessário, documentação mobile.

- [ ] Ajustar ícone, nome, safe areas, orientação, links de autenticação e permissões nativas necessárias.
- [ ] Revisar Android e iOS, acessibilidade, comportamento de teclado, upload/download e sessão.
- [ ] Fazer build local de desenvolvimento para Android quando Expo Go deixar de suportar dependências nativas necessárias.
- [ ] Não publicar nem enviar às lojas sem pedido explícito.

## Ordem recomendada

Executar Fase 1 e tarefas 3–4 primeiro, manter o emulador Android como alvo visível e completar as demais fases por domínio. As telas usam os mesmos dados e contratos; a primeira fase entrega fundação e fluxos clínicos essenciais enquanto o mapa cobre toda a paridade.
