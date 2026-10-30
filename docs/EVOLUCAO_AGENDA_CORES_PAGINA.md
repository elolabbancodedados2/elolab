# Esquema de cores da Agenda em página própria

## Diagnóstico

A personalização do esquema de cores era um diálogo aberto sobre a Agenda. O usuário precisava sair do calendário para ajustar uma preferência persistente e não tinha uma página direta para retomar a configuração. A gravação também dependia de `profile.user_id`, campo que pode não existir no perfil carregado; nesse caso, a escolha não chegava ao servidor.

## Direção e implementação

- `/agenda/configurar-cores` contém a configuração, com o mesmo acesso permitido à Agenda.
- O atalho continua no menu de opções da Agenda e agora navega para a página.
- A tela permite colorir por status, profissional, convênio ou tipo de consulta, mantendo a paleta EloLab e cores legadas já salvas.
- O retorno preserva data, visão e filtros da Agenda pela navegação interna.
- A gravação usa o ID da sessão autenticada, mantém as escolhas na tela quando falha e confirma a saída se houver alterações não salvas.
- O painel de cores escuras usa o token `--brand-dark`, em vez do fundo claro da barra lateral.
- A preferência de visão padrão da Agenda também usa o ID autenticado, corrigindo a mesma identificação incorreta.
- Nenhum contrato, endpoint, permissão ou formato armazenado foi alterado.

## Validação

- Playwright sintético: 2/2. Cobriu navegação sem modal, escrita com o ID esperado, retorno à visão semanal, erro seguido de tentativa, proteção contra descarte e ajuste da visão padrão.
- TypeScript, acessibilidade, permissões, colunas, falhas silenciosas e build passaram.
- ESLint nos arquivos alterados: zero erros; os avisos são `any` já existentes na Agenda e nos hooks.
- Capturas desktop e mobile foram abertas e inspecionadas. A largura móvel não transborda; as ações ficam acima da navegação fixa após a rolagem.
- Nenhuma escrita foi feita em dados reais.

## Limites

A paleta e o formato dos dados existentes foram preservados. Esta entrega remove o modal da configuração de cores, mas não conclui a auditoria global de fluxos e módulos.

## Publicação

Registro de deploy será acrescentado após a publicação e a conferência dos dois domínios.
