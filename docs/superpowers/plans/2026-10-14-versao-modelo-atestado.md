# E50 ? Procedência do modelo de atestado

## Escopo

Capturar pelo banco a identidade e a data da revisão do modelo quando um atestado é emitido. Mostrar a procedência nos detalhes e no PDF. Não copiar conteúdo do modelo nem CID para os metadados. Preservar dados históricos sem origem como nulos.

## Execução e validação

- [x] Testar o formatador e seleção de modelo antes da implementação.
- [x] Criar migration que captura a versão no banco e protege os metadados contra alteração.
- [x] Ligar o modelo selecionado à emissão; exibir o rótulo no detalhe e no PDF.
- [x] PGlite descartável: 6 assertions sobre snapshot, atualização do modelo, modelo global, isolamento, imutabilidade e emissão sem modelo.
- [x] O teste integral revelou uma assertion de visibilidade que competia com a animação de entrada do PortalPaciente; ajustada para aguardar visibilidade e aprovada isoladamente.
- [x] Vitest integral: 296 arquivos e 1.441 testes; recorte do portal/formatador: 30/30.
- [x] TypeScript, acessibilidade, permissões, colunas, falhas silenciosas e `git diff --check`.
- [x] Build pós-commit concluído; `dist/version.json` coincide com HEAD.

A migration permanece local. O atestado informa que não possui assinatura digital; a versão exibida documenta procedência do modelo, não autenticidade criptográfica.
