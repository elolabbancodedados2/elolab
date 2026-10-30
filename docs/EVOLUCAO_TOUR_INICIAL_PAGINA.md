# Tour inicial em página própria

## Diagnóstico

O tour aparecia sozinho como diálogo bloqueante pouco depois de abrir o dashboard. Ele cobria o trabalho, podia ser descartado apenas para a sessão e não deixava um ponto claro para retomada. A página de configuração inicial da clínica já existia, mas não substituía esse tour geral dos módulos.

## Direção e implementação

- O tour agora está em `/tour-inicial`, com etapas, progresso e navegação próprias.
- O dashboard e a configuração da clínica oferecem acesso voluntário ao tour.
- Sair pelo cabeçalho volta ao dashboard sem marcar a conclusão.
- A gravação em `configuracoes_clinica` e a chave local `onboarding_done_<userId>` continuam sendo atualizadas somente ao concluir.
- Se a gravação falhar, o erro aparece na página e o usuário permanece na etapa atual.
- A rota respeita os papéis clínicos que já utilizam as áreas cobertas pelo tour. Não foram alterados APIs, permissões de dados ou regras de negócio.

## Validação

- Playwright sintético: 2/2, incluindo abertura sem diálogo automático, navegação entre etapas, saída sem conclusão, gravação interceptada, conclusão e recuperação de falha ao salvar.
- TypeScript, acessibilidade, permissões, colunas, falhas silenciosas e build: passaram.
- As capturas desktop e mobile foram abertas e inspecionadas. No mobile, as ações ficam acima da navegação fixa depois de rolar até o fim da página.
- Nenhuma escrita foi feita em dados reais.

## Limites

O tour deixou de aparecer automaticamente. Quem quiser conhecê-lo inicia pelo dashboard ou pela configuração da clínica. Esta entrega remove o diálogo de primeiros passos, mas não conclui a auditoria dos demais fluxos do EloLab.

## Publicação

Publicado em 30/10/2026 no commit `1069909705f274e9eafa1617665da29191634698`, imagem `easypanel/elolab/app:deploy-20261030-10699097`. Rollback: `deploy-20261030-3158637`. O smoke isolado e os domínios `app.elolab.com.br` e `elolab.com.br` responderam `healthz=ok` e `/version.json` confirmou o SHA completo. Swarm concluiu a atualização com 1/1 réplica. O hash do `.env` permaneceu igual; fonte anterior preservada em `code.before-20261030-10699097`. Nenhuma migration ou escrita em dados reais.
