# EloLab Mobile — especificação

## Objetivo

Criar um app nativo Android e iOS para a equipe de clínicas usar o EloLab no celular. O app deve substituir a WebView atual por telas React Native próprias e cobrir os módulos, permissões e ações disponíveis na aplicação web.

## Público e tarefas

Usuários: administradores, recepção, enfermagem, médicos, financeiro e administradores da plataforma. No celular, cada pessoa precisa localizar rapidamente pacientes, consultar a agenda, registrar atendimento e acessar os módulos permitidos pelo seu papel.

## Escopo funcional

Manter paridade de capacidade com as rotas e grupos de navegação atuais:

- Início: dashboard, boas-vindas, notificações, histórico, preferências, indicadores e feedback.
- Atendimento: agenda, recepção e caixa, fila e triagem, salas e espera, retornos, higiene, patrimônio e risco de faltas.
- Pacientes: cadastro, busca, histórico, convênios e portal.
- Clínica: prontuários, documentos clínicos, prescrições, atestados, encaminhamentos, sinais vitais, exames, segurança assistencial e modelos.
- Laboratório: painel, mapa de coleta, guias externas e laudos.
- Financeiro: visão financeira, caixa, contas, cobranças, repasses, faturamento de convênios e preços.
- Gestão: relatórios, equipe e convites, estoque, chat, tarefas, automações, agente de IA, configurações, suporte e treinamento.
- Plataforma: painéis administrativos, clínicas, clientes, usuários, faturamento, comunicação, segurança, LGPD, integrações, operações e relatórios agendados.

Os links e guardas existentes em `src/App.tsx` e `src/config/sidebarMenu.ts` são a fonte para nomes de módulos, papéis, planos e acessos. A navegação mobile deve esconder opções sem permissão, mantendo a autorização real no backend.

## Experiência mobile

- React Native com Expo SDK 58; sem WebView para telas do produto.
- Expo Router com pilhas de navegação e abas inferiores para Início, Agenda, Pacientes, Atendimento e Mais.
- Telas em listas, cartões informativos e formulários nativos; tabelas densas e menus laterais web não serão reduzidos para caber na tela.
- Detalhes de paciente e atendimento usam navegação por pilha; ações frequentes ficam próximas ao conteúdo correspondente.
- Suportar safe areas, teclado, toque, acessibilidade, estados de carregamento, vazio, erro e atualização.
- Não inventar dados clínicos. Sem backend configurado, informar o que falta e manter a prévia sem dados reais.

## Arquitetura e dados

- App independente em `expo-mobile/`; a aplicação Vite e suas rotas continuam funcionando.
- Compartilhar o projeto Supabase existente, suas tabelas, Edge Functions, RLS, papéis e entitlements. Não criar outra fonte de dados.
- Usar somente URL e chave publishable no cliente. Nunca incluir `service_role`, senha ou segredo no bundle.
- Manter auth, troca de clínica e permissões do usuário. Não relaxar guardas para facilitar a interface.
- Adaptar dados e fluxos a controles React Native; componentes DOM, `className`, `localStorage` web e bibliotecas exclusivas de navegador não são reaproveitados nas telas nativas.
- Não fazer deploy, migration nem alteração de produção.

## Direção visual

Referência principal: `DESIGN.md` do EloLab. Preservar o violeta como cor de ação/foco, azul-noite como estrutura, fundo frio, superfícies claras, estados semânticos e tipografia Manrope. Aplicar espaçamento e hierarquia para toque e leitura em uma coluna.

Decisões mobile: navegação inferior para destinos frequentes; menu “Mais” para catálogo completo por grupos; barra de título com ação contextual; listas com linhas de toque confortáveis; cartões apenas para resumo e dados relacionados; nenhuma tabela horizontal como padrão de consulta.

Rejeitar: desktop encolhido, navegação lateral comprimida, dashboards com grades de cartões repetidas e números sem ação, dados fictícios apresentados como reais.

## Critérios de aceite

1. Expo Go abre telas React Native próprias no emulador Android; a tela do produto não carrega o site Vite numa WebView.
2. Login, sessão persistente, logout, MFA e retorno de links autenticados respeitam as regras atuais.
3. Cada grupo de navegação atual tem rota nativa, acesso por papel/plano e fluxos de leitura e escrita equivalentes.
4. Dados clínicos e financeiros permanecem protegidos por RLS; o cliente nunca recebe credencial privilegiada.
5. As principais tarefas funcionam em larguras de celular sem depender de hover, tabelas desktop ou menus web.
6. Typecheck e lint do projeto Expo passam; o emulador mostra os fluxos implementados.

## Referências consultadas

- `DESIGN.md` e configuração de rotas/menu do EloLab.
- Expo Router e armazenamento/variáveis do Expo SDK 58: documentação oficial.
- Supabase Auth para Expo/React Native: documentação oficial.
- Busca de telas do Refero indisponível nesta sessão por assinatura inativa; a direção visual fica ancorada no sistema existente do EloLab.
