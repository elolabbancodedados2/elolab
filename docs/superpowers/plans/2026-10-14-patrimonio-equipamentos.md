# N5: Patrimônio, manutenção e calibração de equipamentos

## Auditoria do checkout

- `laboratorio_equipamentos` registra analisadores laboratoriais, setor, número de série, status e vencimento de calibração. A tela atende o fluxo LIS/controle de qualidade, mas não tem ordens de serviço, anexos ou histórico operacional completo.
- Salas armazenam apenas etiquetas de equipamento em texto. Não existe inventário geral, responsável por ativo, documento privado ou bloqueio de sala por ativo indisponível.
- O estoque permanece voltado a consumíveis e materiais; não é reutilizado como cadastro patrimonial.

## Implementação

- Nova rota autenticada `/patrimonio-equipamentos` para ativos gerais da clínica, associados à sala e clínica ativa. O cadastro de analisadores existente continua sendo a fonte do laboratório e não é copiado.
- Cadastro de patrimônio, fabricante/modelo/série, localização, responsável ativo da clínica, aquisição, garantia, calibração, periodicidade de manutenção e regra de bloqueio de sala.
- Ordens preventivas/corretivas, inspeção e calibração com prazo, prioridade, responsável, transição de estado, evidência de conclusão e histórico append-only.
- PDFs e imagens usam bucket privado de 10 MB com MIME restrito. Só admin/enfermagem listam ou abrem documentos; links assinados duram 60 segundos. Sem grants de leitura/escrita direta nas tabelas.
- Edge Function valida JWT, perfil ativo, clínica, papel e caminho do arquivo; operações usam compare-and-set para evitar sobrescrita concorrente.
- Triggers validam referências da sala/responsável/ativo dentro da clínica, registram auditoria na mesma transação e impedem apagar ativos, ordens, documentos e histórico.
- Ativo com bloqueio configurado move sala disponível para manutenção e impede qualquer transição a disponível enquanto o ativo estiver fora de operação. A recuperação do equipamento não libera a sala automaticamente.

## Validação local

- Vitest de contrato da migration: 2/2; Playwright Chromium sintético: 1/1, cadastro, ordem, conclusão, anexo privado e estado de bloqueio.
- PGlite PostgreSQL efêmero aplicou a migration junto ao N4 e executou os triggers: isolamento clínica/sala/ativo, bloqueio e retorno controlado, ciclo de OS, documento, auditoria e políticas Storage.
- TypeScript, `deno check`, ESLint focal, checks de permissões/colunas/falhas/acessibilidade aprovados. Parse SQL: 62 instruções e 8 funções PL/pgSQL.
- Suíte Vitest do checkout: 275 arquivos / 1.369 testes aprovados.
- PGlite é apenas QA descartável; nenhuma migration foi aplicada remotamente e não houve alteração de dados reais.
