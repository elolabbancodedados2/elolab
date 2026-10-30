# Salvar relatório personalizado em página própria

## Diagnóstico

O construtor colocava salvamento e agendamento em um diálogo de até 85vh. A tarefa reúne nome e descrição, recorrência, destinatários autorizados, pré-checagem do canal de e-mail, confirmação do fuso de Brasília e controle de concorrência ao atualizar um item existente.

## Jornada e implementação

- A ação `Salvar / Agendar` abre `/relatorios/salvar`, com formulário e resumo dos critérios em uma página dedicada.
- A tela preserva a seleção do dataset e os filtros do construtor. Voltar retorna ao construtor e restaura a consulta; o contexto sensível fica somente em memória, sem URL, armazenamento persistente ou escrita prévia.
- Uma atualização pode ocorrer apenas para o relatório do usuário atual e compara `updated_at` para detectar alterações concorrentes.
- O agendamento exige canal ativo, destinatários devolvidos pelo preflight e confirmação explícita do fuso `America/Sao_Paulo`. Falha de preflight oferece nova tentativa.
- A rota permanece restrita a `admin` e `financeiro`. Clínica, conta e acesso ao dataset são conferidos novamente antes da gravação.
- A página avisa antes de abandonar o rascunho. Voltar ao construtor mantém os dados; descartar em outra navegação limpa o rascunho.

## Integrações preservadas

- A pré-checagem continua usando `scheduled-reports-runner`.
- Favoritos e agendamentos continuam usando a tabela `relatorios_salvos`; atualização mantém filtros de ID, usuário, clínica e versão.
- Não houve alteração de RPC, contrato, migration, política ou envio real de e-mail.
- O Playwright interceptou as leituras, preflight e gravações da clínica sintética. Nenhum dado real foi salvo ou enviado.

## Validação

- Playwright 4/4: edição compare-and-set, agendamento com destinatário e fuso, bloqueio sem canal de e-mail e retorno preservando os filtros.
- Vitest 8/8 nos testes relacionados a atualização, preflight e acessibilidade.
- TypeScript, build, verificações de acessibilidade, permissões, falhas silenciosas e colunas passaram.
- ESLint não encontrou problemas na página nova.
- Capturas da interface renderizada em desktop e mobile foram inspecionadas; a ação de salvar fica acessível acima da navegação inferior. A tela não abre diálogo.

## Publicação

Preencher após o rollout e a confirmação de `/healthz`, `/version.json` e do serviço.
