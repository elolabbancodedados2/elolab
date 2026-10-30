# Privacidade de pacientes — exportação e entrega em páginas próprias

## Diagnóstico

Na tela de direitos do titular, a seleção do escopo da exportação e o registro da evidência de entrega eram formulários em diálogos. A confirmação de entrega encerra um protocolo e exige justificativa auditável; o escopo pode incluir informações clínicas e financeiras.

## Direção e implementação

- A seleção do escopo e a confirmação da entrega agora ocupam telas próprias dentro de `/lgpd-pacientes`, identificadas somente por `?tela=exportar` ou `?tela=entrega`.
- Identidade do paciente, protocolo e evidência permanecem em memória. A URL não carrega identificadores nem conteúdo pessoal; ao atualizar ou abrir diretamente o fluxo, a tela pede seleção novamente.
- Categorias aparecem com descrição, cadastro permanece obrigatório e a função `exportPatientData` conserva o filtro, o protocolo e a trilha de auditoria existentes.
- A confirmação só pode continuar quando a consulta da clínica ainda mostra o protocolo como pendente. A conclusão usa a RPC existente `concluir_exportacao_lgpd_paciente`; validação de 20 a 1.000 caracteres e evidência sem dados clínicos foram preservadas.
- Rascunhos pedem confirmação ao sair. A rolagem volta ao topo ao abrir a tarefa e retorna à posição da lista ao sair.
- Confirmações breves de cancelamento e descarte continuam contextuais. Exclusão de dados segue indisponível nesta tela e requer análise do suporte.

## Validação

- Playwright sintético 2/2: geração e download do JSON com escopo selecionado, gravação do protocolo pendente, RPC de auditoria, confirmação de entrega, recuperação após recarga, proteção de rascunho e ausência de identificadores na URL.
- TypeScript, build, ESLint focal, acessibilidade, permissões, falhas silenciosas, colunas e `git diff --check` passaram; testes unitários LGPD 7/7.
- Inspecionei as capturas renderizadas em desktop e mobile. Em 390 px não há overflow horizontal; os botões ficam acima da navegação inferior.
- Todas as gravações e respostas de serviço dos testes foram interceptadas com dados sintéticos. Nenhum dado de paciente ou protocolo real foi exportado ou alterado.

## Publicação

Commit `5af4fd60a5812c15ce692acf30086b58d3604c83`; imagem `easypanel/elolab/app:deploy-20261030-5af4fd6`; rollback `deploy-20261030-7714c00`. O smoke isolado e os dois domínios (`app.elolab.com.br` e `elolab.com.br`) responderam `/healthz=ok` e `/version.json` com o SHA integral. O serviço Swarm ficou em 1/1. A fonte anterior está preservada em `code.before-20261030-5af4fd6`. O hash do `.env` permaneceu `f2bcf73f6d860dec143ae363f755d3d18e41dc2f3ea3919944af62899c2f3b65`, sem leitura ou exposição dos valores. Nenhuma migration ou gravação de produção foi realizada.

## Limites restantes

Esta entrega não valida a cobertura legal de todos os sistemas externos, RLS ou dados reais de uma clínica. O aviso já existente permanece: documentos externos e anexos acima do limite exigem conferência assistida; a exclusão de dados não está implementada nesta tela. A sequência operacional e a auditoria global do EloLab continuam em andamento.
