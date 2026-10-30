# Aviso de atualização do EloLab sem modal

## Diagnóstico

O layout já mostrava no topo um aviso sobre a atualização anunciada para 10/11, mas também abria o modal global “EloLab 2.0” para contas que ainda não o tinham dispensado. Isso repetia a mensagem e interrompia a primeira navegação, contrariando a escolha por um aviso persistente e não bloqueante.

## Implementação

- A faixa `UpgradeNotice` permanece no início do conteúdo global, antes da navegação e das páginas.
- O modal `Version20Announcement` e sua montagem no `MainLayout` foram removidos.
- O fixture sintético deixou de gravar uma chave local para ocultar o modal; a cobertura verifica o comportamento real do layout.
- Texto, data, identidade EloLab e estilo semântico da faixa não foram alterados.

## Validação

- Playwright: 1/1; sem diálogo e sem chave de “anúncio visto”.
- Capturas renderizadas em 390 px e 1440 px inspecionadas; aviso permanece legível no topo, não há overflow horizontal e o restante do dashboard continua acessível.
- TypeScript, `check:a11y`, ESLint focal e `git diff --check` passaram; build de produção será registrado após o commit.

## Publicação

Registrar o commit, a imagem, o rollback e os resultados de saúde após o deploy.

## Limites

Esta mudança remove somente o popup duplicado. A faixa permanece temporária e tem a data 10/11 definida pelo responsável.
