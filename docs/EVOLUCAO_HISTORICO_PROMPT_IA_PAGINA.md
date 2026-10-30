# Histórico do prompt da IA em página própria

## Diagnóstico

O histórico da IA já era uma seção de leitura, mas abrir o conteúdo completo de uma versão criava um modal alto sobre a configuração da plataforma. Prompts longos exigiam rolagem dentro do overlay e não tinham endereço direto para a consulta.

## Direção e implementação

- A leitura de cada versão agora abre `/admin/ia/versoes/:versionId`.
- O botão permanece junto ao registro correspondente no histórico e a página oferece retorno a `/admin/ia`.
- Versão, modelo, data e prompt completo são exibidos em uma tela somente de leitura.
- A rota usa a mesma proteção de acesso de plataforma de `/admin/ia`.
- Erro e versão inexistente têm estados claros; nenhuma RPC, versão publicada ou configuração é alterada.
- O breadcrumb oculta o identificador interno e mostra “Versão do prompt”.

## Validação

- Playwright sintético: 2/2, incluindo acesso autorizado, leitura direta após recarga, retorno, ausência de modal, navegação móvel e bloqueio para usuário sem acesso de plataforma.
- Testes de breadcrumb: 34/34.
- Capturas desktop e mobile foram abertas e inspecionadas; o prompt quebra linhas sem transbordar a tela.
- Nenhuma publicação de prompt ou escrita real foi realizada.

## Limites

Esta mudança melhora a consulta do histórico; não altera o ciclo de configuração ou publicação da IA. A auditoria dos demais fluxos de plataforma permanece em andamento.

## Publicação

- Commit publicado: `b70884eb44f7a900bade386e30654f9215d077fa` (`deploy-20261030-b70884`).
- Smoke isolado: `healthz=ok`; `version.json` retornou o SHA completo esperado.
- `https://app.elolab.com.br` e `https://elolab.com.br`: `healthz=ok`; ambos retornaram o SHA esperado.
- Swarm: `elolab_app` está `1/1`, com atualização `completed`.
- Hash do `.env` permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`.
- Backup da versão anterior: `code.before-20261030-b70884`.
- Rollback disponível: imagem `easypanel/elolab/app:deploy-20261030-e9392a56`.
