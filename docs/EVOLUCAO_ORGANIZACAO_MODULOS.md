# Organização dos módulos da navegação

## Diagnóstico

- Os recursos de equipe, estoque e manutenção estavam espalhados em três grupos, embora componham a gestão diária da clínica.
- Comunicação interna, mensagens para pacientes e automações apareciam em grupos separados.
- A análise de risco de faltas estava dentro de Atendimento, apesar de ser uma ferramenta de análise.
- Preços e serviços apareciam duas vezes no menu.
- A preferência local do menu armazenava os nomes antigos dos grupos; sem uma versão nova, as categorias renomeadas poderiam iniciar recolhidas.

## Estrutura aplicada

Os módulos do app agora se organizam por rotina: Início, Atendimento, Pacientes, Clínica, Laboratório, Financeiro, Gestão da clínica, Comunicação e automação, Relatórios e indicadores, Configurações e Ajuda. O Painel da plataforma mantém seus próprios grupos e modo de navegação.

Equipe, estoque, higienização e patrimônio estão em Gestão da clínica. Mensagens e automações compartilham Comunicação e automação. Risco de faltas está em Relatórios e indicadores. Preços e serviços aparece uma vez, em Financeiro.

## Segurança e continuidade

- URLs, componentes de destino, APIs e regras de autorização foram preservados.
- Os filtros por papel continuam em cada item; apenas a organização dos grupos mudou.
- Recursos pagos continuam condicionados à assinatura no item correspondente.
- As categorias favoritas antigas têm uma nova chave de armazenamento para abrir os grupos corretos sem descartar a preferência de menu recolhido.
- As categorias específicas do Painel da plataforma não foram alteradas.

## Arquivos

- `src/config/sidebarMenu.ts`: categorias e posição dos atalhos.
- `src/components/layout/Sidebar.tsx`: nova versão da preferência de grupos.
- `src/config/__tests__/sidebarMenu.test.ts` e `src/components/layout/__tests__/Sidebar.test.tsx`: organização, deduplicação e preservação de acesso.
- `tests/helpers/syntheticClinic.ts` e `tests/sidebar-organization.spec.ts`: cenário sintético e verificação visual responsiva.

## Validação

Evidência de 30/10/2026:

- Testes de menu, matriz por perfil e sidebar: 41/41 aprovados.
- E2E desktop/mobile: 2/2 aprovados; o grupo de gestão também foi aberto pelo teclado.
- Capturas desktop e mobile foram inspecionadas; não houve overflow horizontal no celular.
- `check:permissoes`: 16 grupos, 74 itens e 208 rotas protegidas concordam.
- `check:a11y`, `check:falhas`, ESLint e build de produção aprovados.
- As chamadas de backend dos testes foram sintéticas; nenhum dado de clínica foi alterado.

Publicação: preencher com o SHA após a atualização e o smoke check de produção.

## Limites

Esta entrega organiza a navegação global. Ela não declara os módulos ou seus fluxos internos integralmente auditados; a auditoria operacional continua por módulo, conforme `SEQUENCIA_PAGINAS_OPERACIONAIS.md`.
