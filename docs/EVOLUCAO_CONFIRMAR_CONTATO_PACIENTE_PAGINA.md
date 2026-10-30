# Confirmação de contato do paciente em página própria

## Diagnóstico

Na aba Dados da ficha, confirmar telefone ou e-mail abria um diálogo para selecionar quem confirmou o dado. A tarefa grava data, origem e responsável via RPC; o overlay reduzia o contexto e o retorno não atualizava de forma confiável a ficha em rota profunda.

## Direção e implementação

- A ação abre `/pacientes/:patientId/contatos/:channel/confirmar` e mostra a pessoa, o canal cadastrado, a confirmação atual e a origem escolhida.
- Apenas `admin` e `recepcao` acessam a tarefa, conforme `can_manage_data` validado pela função do banco. A mesma restrição continua no backend.
- As origens permitidas permanecem `paciente`, `responsavel` e `equipe`. A tela impede confirmar um canal vazio e mostra orientação específica para falhas conhecidas da RPC.
- `registrar_confirmacao_contato_paciente` e seus parâmetros foram preservados. Após salvar, a tela invalida a ficha detalhada, o deep link do paciente e as listas; volta à aba Dados com o contexto e a rolagem anteriores.
- O breadcrumb não expõe IDs nem segmentos técnicos intermediários. O rascunho de origem não salvo é protegido ao navegar.

## Validação

- Playwright: 4/4 cenários passaram — confirmação e retorno com estado atualizado, recuperação de falha, bloqueio para perfil médico e bloqueio quando não existe contato cadastrado.
- Regressão da página de status do paciente: 3/3 cenários passaram.
- TypeScript, build, acessibilidade, permissões, falhas silenciosas e verificação de colunas passaram.
- ESLint focal sem erros; 54 avisos preexistentes de `any` em `Pacientes.tsx`.
- Capturas mobile (390 px) e desktop (1440 px) foram inspecionadas. O scroll do formulário deixa Cancelar e Registrar confirmação acima da navegação fixa.
- As chamadas de escrita foram interceptadas; nenhum contato real foi marcado como confirmado. Nenhuma migration foi aplicada.

## Publicação

Commit `0ec8e612aa3c9bdccce9325ea2f77a0b1db65aaf`; imagem `easypanel/elolab/app:deploy-20261030-0ec8e61`; rollback `deploy-20261030-5b603fa`. Container isolado, `/healthz`, SHA de `/version.json` nos domínios `app.elolab.com.br` e `elolab.com.br`, e Swarm 1/1 foram confirmados. Fonte anterior preservada em `/etc/easypanel/projects/elolab/app/code.before-20261030-0ec8e61`. O hash do `.env` permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`, conferido sem ler ou exibir valores.

## Continuidade

Esta entrega remove uma tarefa operacional do diálogo, mas não encerra a auditoria de Pacientes nem dos demais módulos. Confirmações curtas e destrutivas permanecem contextuais; as jornadas de plataforma, dados e financeiro continuam no inventário de pendências.
