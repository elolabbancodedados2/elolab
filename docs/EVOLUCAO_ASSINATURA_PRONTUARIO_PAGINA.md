# Assinatura eletrônica do prontuário em página própria

## Diagnóstico

- A revisão e a confirmação da assinatura ficavam num diálogo sobre o workspace clínico. O profissional precisava confirmar identidade e efeito de bloqueio sem um contexto que pudesse ser retomado pela URL.
- A assinatura é uma transição clínica crítica: não deve acontecer enquanto a versão está sendo editada ou contém alterações não salvas.
- O servidor já oferece a RPC `assinar_prontuario_verificavel`, que valida a clínica, exige médico ativo com CRM e registra hash, autoria, horário e trilha de auditoria.

## Jornada e implementação

- O acionador do prontuário salvo abre `?tela=assinatura-eletronica`, mantendo paciente, registro e seção. A rota aceita um registro ainda não assinado apenas nesta tela de assinatura; o fluxo comum de abertura do histórico mantém suas validações.
- A tela mostra paciente, profissional, CRM e documento antes da confirmação. Explica que se trata de assinatura eletrônica simples, sem certificado ICP-Brasil, e que a assinatura bloqueia edição; correções futuras devem ser feitas como adendo.
- Um registro não persistido não pode ser assinado. Edição, salvamento em curso ou alterações pendentes mantêm a ação bloqueada.
- Cancelar retorna ao mesmo prontuário e seção e restaura o foco no acionador. Depois do sucesso, o estado exibido usa o horário retornado pelo servidor, refaz a leitura do prontuário e move o foco para o estado de assinatura.
- Falha da RPC permanece na tela, apresenta uma mensagem recuperável e permite nova tentativa depois de revisar o prontuário. Um prontuário já assinado é somente leitura.

## Integrações preservadas

- Mesma RPC `assinar_prontuario_verificavel`, com o mesmo parâmetro `p_prontuario_id`.
- Continua sendo o banco que valida clínica, perfil médico ativo, CRM, imutabilidade, hash e auditoria. A página não muda permissão nem contrato.
- A leitura do código de verificação continua em `prontuario_assinaturas`. Não há novas gravações fora da RPC.
- Nenhuma migration, dependência ou alteração financeira foi feita.

## Validação

- Vitest: 6/6 nos testes de assinatura, incluindo abertura sem diálogo, chamada da RPC existente, retorno após sucesso e erro recuperável.
- Playwright: 12/12 no conjunto de continuidade do prontuário. A rota da assinatura abre diretamente e sobrevive a recarga; o conjunto confirma contexto, ausência de diálogo, assinatura sintética, retorno e foco.
- TypeScript (`npx tsc --noEmit`) e build de produção passaram.
- `check:a11y`, `check:permissoes`, `check:falhas`, `check:colunas` e `git diff --check` passaram. ESLint passou sem erros; os avisos restantes são `any` já existentes no módulo de prontuários e assinatura.
- Capturas renderizadas em 390 × 844 e 1440 × 1000 foram inspecionadas. No mobile, o conteúdo pode rolar e as ações ficam acima da navegação inferior; no desktop, a revisão ocupa uma seção ampla e legível.
- Todos os dados e chamadas de assinatura nos testes são sintéticos; nenhum prontuário real foi assinado.

## Publicação

- Commit: `e98e83ebf2df351577a9759e51c90eac0ebb77c3`.
- Imagem: `easypanel/elolab/app:deploy-20261030-e98e83e`.
- Smoke isolado: `/healthz=ok`; `/version.json` confirmou o SHA integral.
- Produção: Swarm concluiu a atualização (`completed`) com 1/1 réplica; `/healthz` público respondeu `ok` e `/version.json` publicou o mesmo SHA.
- Rollback imediato: `deploy-20261030-e0b2ae3`.
- Código anterior preservado em `/etc/easypanel/projects/elolab/app/code.before-20261030-e98e83e`. O `.env` foi copiado e comparado por hash, sem leitura ou exposição.
- Houve uma disputa transitória pela porta host-mode após o smoke; o Swarm repetiu a tentativa, liberou a porta e concluiu sem rollback. Nenhuma migration ou alteração de dados de produção.
