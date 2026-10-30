# Histórico de alterações das contas a pagar

## Diagnóstico atual

O histórico era carregado dentro de um diálogo aberto a partir da lista de contas a pagar. A tabela apresentava autor, data e valores anteriores e atuais, mas cobria a lista durante a consulta e não tinha endereço próprio.

## Direção e implementação

- A ação agora abre `/contas/pagar/:lancamentoId/historico`, em uma tela somente de leitura.
- O cabeçalho identifica a conta e resume valor e vencimento atuais; abaixo, uma tabela mostra data, autor, campo, valor anterior e valor novo.
- Estados de carregamento, erro recuperável e histórico vazio são explícitos.
- A conta é validada por ID, clínica ativa e tipo `despesa` antes da RPC existente consultar a trilha.
- A rota mantém os perfis `admin` e `financeiro`; a autorização e o escopo da RPC existente não foram alterados.
- A volta preserva URL, estado de navegação, busca textual e filtros da lista. O identificador interno não aparece no breadcrumb.
- Nenhum dado financeiro é criado ou alterado por esta tela.

## Validação

- Playwright sintético: 3/3 — leitura autorizada, bloqueio da trilha para conta fora da clínica e recuperação após falha.
- Vitest relacionado: 38/38; TypeScript sem erros.
- Verificações de acessibilidade, permissões e colunas passaram.
- Capturas desktop e mobile foram inspecionadas; a tabela adapta as linhas em telas estreitas e não cria rolagem horizontal da página.

## Limites

Esta entrega cobre o histórico de alterações de contas a pagar. A auditoria dos demais detalhes e ações financeiras e a revisão integral dos módulos ainda continuam.

## Publicação

Registro do deploy será preenchido após a conferência do smoke, dos dois domínios e do estado do serviço.
