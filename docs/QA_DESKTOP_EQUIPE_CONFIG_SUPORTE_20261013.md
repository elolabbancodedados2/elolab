# QA desktop: Equipe, Configurações e Suporte — 13/10/2026

## Escopo e ambiente

Revisão visual de /equipe, /configuracoes e /suporte em 1440×900 e 1280×800, com Chromium, Vite local em modo de teste e dados sintéticos. As rotas Supabase apontaram para 127.0.0.1:54321 e foram interceptadas; nenhuma rede remota, credencial ou dado real foi usado. O relatório original do agente QA e as capturas detalhadas estão nos artefatos temporários qa-equipe desta sessão.

## Achados e correções

O relatório inicial encontrou 1 achado P1, 5 P2 e 5 P3. As correções locais abaixo foram feitas e verificadas nas mesmas larguras:

- **Suporte — detalhe fora da tela ao selecionar chamados:** o painel de detalhes agora permanece sticky no desktop, com altura máxima e rolagem própria. Após selecionar o último de 14 chamados, o título ficou em y=109 e o campo de resposta em y=381 tanto em 1440×900 quanto em 1280×800.
- **Suporte — seleção sem destaque e prioridade alta sem diferenciação:** chamado selecionado recebe borda e fundo de seleção; prioridade alta usa o estado warning, e crítica continua destrutiva.
- **Suporte — formulário ocupava a primeira dobra:** abertura do chamado passou para um diálogo acionado pelo cabeçalho compartilhado. A fila e o painel de detalhes aparecem logo abaixo do cabeçalho; envio sintético fechou o diálogo, limpou o formulário e mostrou “Chamado aberto.”
- **Suporte — erro mostrava “0 no total”:** contagens somem quando a consulta falha, os filtros são desativados e a tela explica que a fila está indisponível. Datas agora omitem segundos.
- **Equipe — ações de convite cortadas em 1280:** o rótulo textual de “Reenviar” é compactado abaixo de 1536 px; o rótulo acessível permanece no botão. A medição após a correção registrou tabela e área rolável com 886 px, sem overflow interno; o botão final terminou em x=1210, dentro do wrapper até x=1226.
- **Equipe — buscas sem nome acessível:** buscas de médicos e funcionários receberam rótulos explícitos.
- **Corpo clínico — avatar começava com “DR”:** o prefixo Dr./Dra. é removido; as iniciais usam primeiro e último nome. O cartão inativo mantém texto em opacidade total, com fundo suave e avatar atenuado.
- **Auditoria/configurações — controles sem rótulo:** atualização, filtros, datas e buscas da auditoria receberam nomes acessíveis. O link de agendamento tem associação entre Label e campo.
- **Configurações — aba não persistia ao navegar/recarregar:** as abas agora atualizam ?tab= sem descartar outros parâmetros. A navegação para Backup e o reload mantiveram Backup selecionado.
- **Estados e semântica:** KPIs de convite deixaram de usar headings compostos apenas por números e adotaram cores semânticas; a aba Convites ganhou título de página. O estado “Sincronizado” usa tokens de sucesso e o loading de configurações anuncia seu estado.
- **Metadados dos médicos:** telefone não quebra em várias linhas; e-mail truncado tem reticências, título e foco de teclado; nomes longos têm title.

## Verificação

- npm run build passou e gerou o bundle/PWA local.
- As quatro jornadas exploratórias anteriores (Equipe, Configurações, Suporte e vazio/erro do Suporte) passaram novamente: 4/4.
- A inspeção adicional de métricas e estados (cartões, largura da tabela, loading/auditoria e seleção/foco no Suporte) passou: 3/3.
- A nova captura de Suporte confirmou o painel de detalhes visível após selecionar o chamado 14. A captura de convites confirmou a ação final dentro do wrapper em 1280 px. Configurações manteve a aba Backup no endereço e após reload.
- Essas execuções usam scripts temporários e comprovam os fluxos exercitados, não substituem teste de integração com backend ou auditoria de todas as permissões.

## QA pendente apos complemento

Ainda falta validar a persistencia das configuracoes em backend descartavel e percorrer o salvamento das demais abas. O tema escuro nao esta implementado no ThemeContext. Os fluxos de status/notas, conversas testadas, dialogos de equipe e cancelamento sem escrita foram cobertos abaixo. Nenhum deploy, migration ou acesso a dados de assinantes foi realizado.

## Complemento de QA independente — 13/10/2026

O agente Claude atingiu o limite antes de entregar a revisão solicitada. Completei os fluxos de desktop com Chromium e backend sintético local; não usei credenciais, banco remoto nem dados reais.

- `/admin/suporte`: alterei o status usando teclado e enviei uma nota interna em 1440×900 e 1280×800. Payloads sintéticos confirmaram `interno: true`; a nota interna aparece na conversa de plataforma, e o seletor mantém foco após a gravação.
- `/equipe`: abri e fechei os diálogos de funcionário, personalização de perfis e médico. O formulário de funcionário rola dentro do modal; os diálogos cabem na viewport e devolvem o foco ao acionador.
- `/equipe?aba=convites`: abri a confirmação de cancelamento e voltei sem enviar escrita de cancelamento; o foco volta ao botão da linha.
- Corrigi a restauração de foco nos componentes compartilhados de diálogo e confirmação. Em `/admin/suporte`, o controle de status também recupera o foco depois que a operação termina.
- Tema escuro permanece indisponível: `ThemeContext` força tema claro; portanto a inspeção visual de tema escuro não se aplica ao comportamento atual.

Evidência: `npx playwright test tests/qa-equipe-suporte-interactions.spec.ts --project=chromium --workers=1 --retries=0` passou 3/3. As escritas ficaram restritas às rotas Supabase interceptadas pelo Playwright; os testes confirmam interação e payload sintético, não persistência real no banco. Nenhuma migration ou deploy foi executado.

## Busca global na fila de suporte — 13/10/2026

- A busca, o status e a prioridade agora fazem parte da consulta paginada ao servidor; a contagem e a paginação refletem os resultados filtrados em toda a fila visível ao usuário, conforme RLS.
- O campo pesquisa título e descrição, aplica debounce de 250 ms e remove pontuação de sintaxe de filtro. A ordenação por SLA/prioridade permanece dentro de cada página.
- Evidência: `centralSuporte.test.tsx` passou 9/9, incluindo o filtro da consulta e a sanitização; TypeScript e ESLint focal passaram. Não houve consulta a backend real; a persistência e RLS continuam pendentes de ambiente descartável.
