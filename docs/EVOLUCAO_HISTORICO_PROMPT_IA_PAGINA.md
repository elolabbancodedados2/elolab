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

Registro de deploy será acrescentado após a publicação e a conferência dos dois domínios.
