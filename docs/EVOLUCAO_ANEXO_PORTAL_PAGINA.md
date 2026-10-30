# Gestão do acesso de anexos pelo Portal do Paciente

## Diagnóstico

- Publicar ou revogar um anexo era uma tarefa extensa dentro de um modal sobre o prontuário.
- A consulta da lista de anexos não trazia `tipo_arquivo` nem `tamanho_bytes`, embora a interface use esses campos para renderizar o ícone e o tamanho. Com registros reais, `tipo_arquivo` ausente podia interromper a renderização.
- O profissional precisava confirmar origem, validade e estado atual sem uma página que pudesse ser recarregada ou compartilhada internamente como contexto.

## Jornada e implementação

- Perfis autorizados existentes: administrador e médico. A regra de acesso do backend e a RPC permanecem responsáveis por validar a operação.
- A ação abre `?tela=anexo-portal&anexo=<id>` na seção de anexos do mesmo paciente e prontuário. A tela restaura por URL, mostra nome, categoria, tamanho, origem e validade, e retorna à lista com foco no controle de origem.
- O estado atual é confirmado antes de exibir ações. Falha ao carregar anexos ou publicação impede alterações e oferece nova tentativa. Um ID ausente e acesso sem permissão têm mensagens próprias.
- A publicação preserva origem e validade futura opcional. A revogação é explícita e informa que o acesso será encerrado. Os erros deixam a tarefa na página para recuperação.
- O paciente recebe acesso pelo portal por meio de link privado de cinco minutos; esta ação não torna o arquivo público nem envia notificação.
- O preview do arquivo continua em diálogo. A confirmação curta de exclusão também permanece, pois não é o formulário de publicação.

## Integrações preservadas

- Consulta existente a `documentos_portal_paciente`.
- Mesma RPC `gerenciar_documento_portal_paciente`, com os parâmetros existentes `p_anexo_id`, `p_publicado`, `p_validade_ate` e `p_origem`.
- Mesmo escopo do paciente/prontuário, permissões e trilha clínica. Nenhuma migration, alteração de contrato ou escrita real foi feita.

## Validação

- Vitest: 12/12 em anexos, incluindo navegação sem modal, publicação, revogação, recuperação de erro e bloqueio sem permissão.
- Playwright: 11/11 no conjunto de continuidade do prontuário, incluindo abertura da página, recarga do deep link, publicação sintética, retorno ao contexto, foco, mobile e desktop.
- TypeScript, build de produção, `check:a11y`, `check:permissoes`, `check:falhas`, `check:colunas` e `git diff --check` passaram.
- Inspecionei capturas renderizadas em 390 × 844 e 1440 × 1000. A tela adapta os campos no mobile, sem rolagem horizontal; a ação continua acima da navegação inferior.
- ESLint sem erros. Permanecem avisos preexistentes de `any` no módulo de prontuários e dois usos no componente de anexos.
- Nenhum prontuário, anexo ou estado de publicação real foi lido ou alterado durante os testes.

## Publicação

- Commit de código: `e0b2ae3d49775407de4a187397490f68695f9b4f`.
- Imagem: `easypanel/elolab/app:deploy-20261030-e0b2ae3`.
- Smoke local da imagem: `/healthz=ok`; `/version.json` confirmou o SHA integral.
- Produção: Swarm concluiu a atualização com 1/1 réplica; `/healthz` público respondeu `ok` e `/version.json` publicou o mesmo SHA.
- Rollback imediato: `deploy-20261030-66c5849`.
- Fonte anterior preservada em `/etc/easypanel/projects/elolab/app/code.before-20261030-e0b2ae3`. O `.env` foi copiado e comparado por hash, sem leitura ou exposição.
- A porta host-mode ficou ocupada pelo smoke por alguns segundos durante o início do rollout; o Swarm repetiu a tentativa, liberou a porta e concluiu sem rollback. Nenhuma migration ou alteração de dados de produção.
