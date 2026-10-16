# Histórico de versões de modelos de comunicação

## Objetivo

Manter snapshots imutáveis dos modelos quando são criados, alterados ou removidos, com autoria confiável e histórico visível apenas a administradores da clínica proprietária.

## Desenho

- Criar `notification_template_versions`, sem FK destrutiva para o modelo, com revisão, ação, snapshot, clínica, autor e nome do autor no momento da alteração.
- Registrar mudanças por trigger no banco; nunca confiar em `autor_id` enviado pelo navegador.
- Preencher o estado existente como baseline no momento da instalação, sem inventar autoria ou data histórica; remover snapshots se a clínica for excluída.
- Proteger leitura por RLS; revogar escrita direta de clientes. O trigger `SECURITY DEFINER` escreve as versões.
- Exibir revisões em ordem decrescente na tela de modelos, incluindo alterações de conteúdo e ativação.
- Não restaurar snapshots nesta etapa; restauração poderá ser uma nova revisão explícita em etapa posterior.

## Validação planejada

- Teste de contrato da migration: tabela imutável, escopo por clínica, autoria do JWT, snapshot inicial, operações auditadas e tipos gerados.
- Playwright com REST totalmente interceptado: mostra baseline/autoria ausente e versões, sem gravar em backend.
- Vitest, TypeScript, build e checks de permissões/colunas.
- Não aplicar a migration nem executar contra dados reais nesta etapa.

## Evidência

- Vitest de contrato: 4/4.
- Playwright sintético: 1/1; confirma o escopo da clínica na consulta, autoria legível e baseline sem autor.
- TypeScript e build: aprovados.
- Checks de permissões, colunas, falhas silenciosas e acessibilidade: aprovados.
- ESLint direcionado: 0 erros; 6 avisos `no-explicit-any` já existentes no componente.
- A migration foi criada e revisada estaticamente, mas não foi aplicada nem executada contra PostgreSQL; o checkout não tem `psql` nem parser SQL/Postgres local configurado.
