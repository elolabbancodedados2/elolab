# E52 - Confirmar troca de contexto do paciente

## Escopo

Evitar que uma rota ou seleção altere o paciente ativo enquanto uma evolução clínica está aberta. Preservar a opção de salvar, descartar explicitamente ou continuar no formulário atual.

## Execução e validação

- [x] Auditar fluxo: mudança por rota podia trocar o paciente base com o formulário ainda aberto.
- [x] Testar helper de decisão antes de implementá-lo.
- [x] Interceptar mudança de paciente via rota e seleção.
- [x] Pedir confirmação; permitir salvar e trocar, descartar e trocar ou continuar.
- [x] Manter o formulário aberto se o salvamento falhar.
- [x] Teste focado: 2/2; TypeScript e checks estáticos passaram.
- [x] Vitest integral: 298 arquivos/1.445 testes.
- [x] Build pós-commit concluído; `dist/version.json` coincide com HEAD.
