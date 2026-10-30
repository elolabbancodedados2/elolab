# Backup, recuperação e importação em páginas próprias

## Diagnóstico

A aba Backup das Configurações carregava a exportação, a restauração e a importação de planilhas na mesma tela. A revisão de um backup ficava em um diálogo; nele, uma falha ao calcular o impacto não impedia a restauração e as tabelas protegidas não apareciam identificadas no conteúdo do arquivo.

## Jornada e implementação

- A aba Configurações agora encaminha para `/configuracoes/backup` e `/configuracoes/importar-dados`.
- Backup e recuperação têm um workspace próprio. A prévia substitui o conteúdo da página e não abre diálogo.
- A revisão apresenta a clínica de origem, integridade, totais, impacto por grupo e dados protegidos que não serão restaurados.
- A restauração fica bloqueada até a comparação concluir. Se a comparação falhar, a página explica a falha e permite tentar novamente.
- Escolher outro arquivo descarta a prévia e reinicia a opção de sobrescrita. Os dados do backup permanecem somente na memória da página; recarregar exige selecionar o arquivo de novo.
- Falhas ao consultar espaço e totais atuais não geram rejeições sem tratamento; a tela mostra indisponibilidade e permite repetir a consulta.
- A importação de planilhas mantém os quatro passos e a lógica atual em `/configuracoes/importar-dados`.

## Integrações preservadas

- `downloadBackup`, `validateBackup`, `previaRestauracao` e `restoreBackup` continuam atendendo ao fluxo existente.
- A escrita de restauração continua limitada à clínica ativa e às mesmas regras de sobrescrita e tabelas protegidas. Nenhuma restauração real foi executada nesta entrega.
- A importação mantém seu mapeamento, prévia de duplicidades e gravação existentes. Os testes não importaram dados reais.
- As rotas usam a mesma permissão de `admin` das Configurações. Nenhuma migration, política, contrato de API ou dado de produção foi alterado.
- A aprovação de restauração do painel de plataforma continua sendo apenas uma autorização operacional; a recuperação de desastre completa do FN-02 ainda exige procedimento e ensaio isolado.

## Arquivos

- `src/components/BackupRestore.tsx`
- `src/components/__tests__/BackupRestore.test.tsx`
- `src/pages/ConfiguracaoBackupPage.tsx`
- `src/pages/ImportarDadosClinicaPage.tsx`
- `src/pages/Configuracoes.tsx`
- `src/App.tsx`
- `src/config/routeLabels.ts`
- `tests/configuration-history-page.spec.ts`

Também foram corrigidas falhas do typecheck em respostas JSON das RPCs TISS, chamadas a `replaceAll` incompatíveis com a biblioteca TypeScript atual e um matcher de teste. A validação das respostas agora confere formato e campos antes de usar o resultado. Não houve alteração de payload ou contrato.

## Validação

- Playwright 6/6 para páginas de Configurações e prévia; Playwright 19/19 em regressões de lotes, guias e glosas TISS.
- Vitest 4/4 para o workspace de backup e 18/18 nos testes relacionados de glosas, TISS e duplicidades.
- TypeScript sem erros; build, acessibilidade, permissões, falhas silenciosas e colunas passaram.
- Capturas reais da interface renderizada em desktop e mobile foram inspecionadas; a ação de restaurar fica acima da navegação inferior e não há rolagem horizontal.
- ESLint sem erros; avisos existentes de `any` e dependências de hooks permanecem nos arquivos listados pelo lint.
- O E2E usou um arquivo sintético e interceptou as chamadas. A operação não clicou em “Restaurar Backup”, não importou planilhas nem gravou dados reais.

## Publicação

Preencher após o rollout e a confirmação pública da versão.
