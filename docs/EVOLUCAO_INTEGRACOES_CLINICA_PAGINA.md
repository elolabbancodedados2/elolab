# Configurações — credenciais de integração em página própria

## Diagnóstico atual

O formulário para conectar ou trocar credenciais ficava em um diálogo. A tela não tinha URL própria nem proteção para uma saída acidental, embora algumas conexões exijam vários campos e possam conter segredos.

## Direção e implementação

- A rota `/configuracoes/integracoes/conectar/:integrationId` exibe o provedor, descrição, instruções, estado atual e formulário em página própria, dentro da mesma proteção de administrador.
- O contrato da função `clinic-integrations` e a validação de versão concorrente foram preservados. A integração Mercado Pago por OAuth continua no fluxo existente.
- Credenciais secretas ficam somente no estado da página, nunca na URL ou armazenamento do navegador; campos secretos são senha e não usam autofill. Segredos já salvos continuam sem ser devolvidos pelo servidor.
- A referência do profissional, quando necessária, fica no estado efêmero da navegação. Se o destino não estiver presente em um link direto, a página bloqueia o envio e pede para escolher o profissional de novo.
- Erros de salvamento preservam os campos. Sair com rascunho abre uma confirmação breve; a ação de descarte limpa os campos.

## Validação

Playwright sintético cobre abertura pela lista, rota direta, segredo fora de URL/localStorage, envio do payload à função interceptada, retorno ao catálogo, preservação e descarte do rascunho, ausência de modal e botão acima da navegação inferior no celular. Três E2E relacionados à plataforma/configurações passaram juntos; teste de componente 2/2, TypeScript, build, acessibilidade, permissões, colunas, falhas silenciosas, ESLint e `git diff --check` passaram. Capturas desktop e mobile foram inspecionadas.

Nenhuma credencial real foi inserida e nenhum provedor externo foi acessado. Nenhuma migration ou alteração de função foi feita.

Commit `7714c007449505bb12081d87ad839af8c3388d0a`; imagem `easypanel/elolab/app:deploy-20261030-7714c00`; rollback `deploy-20261030-3f85b85`. Smoke isolado, `/healthz`, `/version.json`, domínios `app.elolab.com.br` e `elolab.com.br`, Swarm 1/1, fonte anterior e hash do ambiente foram confirmados.
