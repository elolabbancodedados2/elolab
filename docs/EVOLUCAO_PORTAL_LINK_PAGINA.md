# Portal do Paciente — geração de link em página própria

## Diagnóstico

A ficha do paciente gerava um link de acesso e, quando a cópia automática falhava, abria um modal por cima do workspace. O token é um segredo de acesso com longa validade; a navegação e o armazenamento do navegador não deveriam persistir esse valor.

## Direção e implementação

- A geração agora ocorre em `/pacientes/:patientId/portal/link`, com contexto da ficha e explicação explícita de que a emissão invalida o link anterior.
- A RPC existente `link_portal_paciente` continua responsável por emitir e rotacionar o token. Nenhuma regra ou contrato de backend foi alterado.
- A rota mantém a autorização de `admin` e `recepcao`, consulta o paciente no escopo da clínica e bloqueia a emissão para ficha inativa.
- O link retornado é validado antes de ser exibido. O valor fica apenas no estado em memória do componente; não é copiado para URL, estado de navegação, `localStorage` ou `sessionStorage`. Ao recarregar ou sair sem copiar, é necessário emitir outro link.
- A página tenta copiar o link e mantém um campo selecionável com orientação de cópia manual caso a API do navegador não esteja disponível.
- Se a ficha não existir ou não pertencer à clínica ativa, a tela explica o bloqueio e oferece retorno seguro à lista, sem chamar a RPC.
- O retorno preserva a aba da ficha, filtros da lista e posição de rolagem. O modal de revogação da ficha continua como confirmação curta para uma ação destrutiva.
- A página de confirmação de contato também passou a iniciar no topo do workspace quando é reaberta, evitando herdar a rolagem da ficha anterior.

## Validação

- Playwright sintético: Portal 4/4; confirmação de contato e regressão de alteração de status 7/7. As gravações foram interceptadas, sem alterações em dados reais.
- TypeScript sem erros; verificações de acessibilidade, permissões, falhas silenciosas e colunas passaram.
- ESLint focal sem erros; os 54 avisos `no-explicit-any` já existentes em `Pacientes.tsx` permanecem.
- Build de produção passou.
- Inspeção das capturas renderizadas em 1440 px e 390 px: identidade e faixa de atualização preservadas; layout responsivo; sem modal; ações móveis ficam acima da navegação inferior. A suíte também confirmou a ausência do token na URL, histórico e armazenamento e que recarregar não repete a emissão.
- Execuções E2E em paralelo excederam o tempo de inicialização do Chromium. A suíte serial passou integralmente; os avisos do canal Realtime nos testes sintéticos são tratados pelo fallback de polling.

## Publicação

Registrar aqui o commit, a imagem publicada, o rollback e os resultados do smoke após o deploy.

## Limites

Esta entrega cobre somente a emissão do link a partir da ficha de paciente. Não conclui a auditoria dos demais fluxos do Portal nem a revisão visual completa do EloLab.
