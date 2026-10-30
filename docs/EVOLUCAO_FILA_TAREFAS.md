# Fila — remoção e passagem de turno em páginas próprias

## Diagnóstico atual

A remoção de paciente exigia selecionar um motivo dentro de um diálogo sobre a fila; isso escondia o contexto de quem está aguardando ou em atendimento e misturava a confirmação com uma decisão que precisa ser registrada. A passagem de turno também abria um diálogo informativo, embora o resumo seja um artefato que o usuário precisa revisar e copiar.

## Direção de redesign

- Apresentar identidade, profissional, data, horário e estado do atendimento antes de remover alguém.
- Deixar explícita a consequência: um atendimento em andamento volta para “aguardando”; nos demais estados, o agendamento é preservado.
- Registrar o motivo estruturado e manter o evento na trilha existente.
- Mostrar o resumo sem nomes ou informação clínica em uma página simples com opção de cópia e seleção manual.
- Manter diálogos somente para confirmações breves de ações críticas.

## Implementação

- `/fila/:filaId/saida` é restrita aos mesmos perfis com ação de remoção na fila: administrador e recepção. Busca somente a linha selecionada com filtro de clínica e mostra erro recuperável quando a fila muda.
- O formulário usa a RPC existente `remover_item_fila_com_motivo`, envia o estado lido como versão esperada e mantém o motivo escolhido quando a tentativa falha. A RPC continua sendo a autoridade de permissão, escopo, concorrência e auditoria.
- O retorno preserva a aba e a busca da fila. A proteção de navegação evita perder o motivo ainda não enviado.
- `/fila/passagem` exibe o snapshot criado na Fila, permite copiar e selecionar o texto para cópia manual se a área de transferência falhar. O conteúdo continua limitado a contagens e estados, sem nomes ou dados clínicos.
- A Fila abre as duas páginas; os diálogos de remoção e passagem foram removidos. Não houve mudança de tabela, payload/RPC, permissão do servidor ou migration.

## Validação

- Vitest: 48/48 nos testes da Fila, remoção, passagem de turno e breadcrumbs.
- Playwright: 2/2 cenários com clínica sintética; remoção por RPC simulada, retorno à aba original e captura mobile/desktop; passagem de turno sem diálogo e com snapshot copiável.
- `npm run build`, `npm run check:a11y`, `npm run check:permissoes`, `npm run check:falhas`, `npm run check:colunas` e `git diff --check` passaram.
- ESLint focal: zero erros; permanecem 22 avisos preexistentes em `Fila.tsx` (21 `any` e um aviso de dependência de hook).
- A inspeção visual das capturas mobile (390 px) e desktop (1440 px) confirmou o padrão EloLab, ausência de transbordamento e botão de remoção acima da navegação inferior. Evidências em `test-results/fila-task-pages-queue-remo-96342-page-with-a-recorded-reason-chromium/` e `test-results/fila-task-pages-shift-hand-bd7ed-anually-selectable-snapshot-chromium/`.
- A checagem TypeScript continua com nove erros preexistentes em seis arquivos financeiros/TISS não alterados: sete `replaceAll` fora da biblioteca-alvo ES2020 e dois casts JSON.
- As gravações foram interceptadas nos testes. Não houve remoção real nem validação autenticada de RLS.

## Limitações e sequência

Uma URL direta para a passagem de turno sem o snapshot de navegação apresenta uma orientação para gerar outro resumo pela Fila. A operação de remoção continua sujeita à revalidação da RPC; alterações concorrentes voltam à fila para nova conferência. A jornada integrada de recepção, triagem, fila e finalização foi validada em ambiente sintético; permissões reais e RLS em produção não foram revalidadas nesta etapa. As etapas clínicas e de plataforma continuam abertas.

## Jornada integrada — Recepção, triagem e fila

### Diagnóstico atual

- A sequência de check-in, triagem, atendimento e finalização já existia, mas a validação anterior não cobria o caminho completo mantendo o contexto entre módulos.
- Na primeira dobra da recepção em 1280×800, a faixa de avisos e o resumo empurravam o terceiro paciente para fora da área visível.
- Em mobile, os indicadores secundários competiam com a ação operacional principal; quando a agenda falhava, a tentativa de recuperação podia ficar escondida pela navegação inferior.
- A triagem clínica tem risco e rastreabilidade próprios; prioridade clínica continua determinada e persistida pelas regras já implementadas.

### Direção e implementação

- A primeira dobra prioriza os indicadores mais úteis e a fila de pacientes esperados. Os cinco indicadores restantes ficam recolhidos em mobile e permanecem disponíveis por ação explícita; em telas maiores continuam visíveis.
- Reduzimos o intervalo acima do painel e a altura mínima da faixa de resumo para recuperar espaço sem remover informação.
- Quando a agenda não carrega, a Recepção mostra uma tela de recuperação compacta, mantém os atendimentos abertos acessíveis e oferece nova tentativa sem exibir uma lista desatualizada como se fosse atual.
- O E2E agora percorre check-in, triagem, passagem à fila, prioridade, abertura do workspace clínico e finalização com retorno; também verifica a preservação das RPCs, dos argumentos e do contexto.
- Nenhum contrato, permissão, regra clínica, banco ou integração foi alterado. As escritas foram interceptadas no navegador de teste.

### Validação e limites

- E2E sintético do conjunto de Recepção/Fila: 26/26 aprovados, incluindo páginas próprias e exceções selecionadas.
- Build de produção, verificadores de acessibilidade, permissões e falhas passaram; `git diff --check` não encontrou erros.
- Capturas mobile e desktop foram inspecionadas: pacientes visíveis na primeira dobra de desktop, indicadores essenciais e ação de check-in visíveis em mobile, e erro da agenda com botão de nova tentativa acima da navegação inferior.
- A validação não executou RLS autenticada, gravações reais, sincronização com backend de produção nem dispositivos físicos. Esses limites não equivalem a uma validação operacional em clínica.
- Próxima área da sequência: cobertura residual de documentos e transições clínicas do prontuário.

## Publicação

Commit `53dc69426f9e09d6e87676a2129add68fd4b7bd8`; imagem `easypanel/elolab/app:deploy-20261030-53dc694`. A imagem foi construída do arquivo versionado com o SHA integral, verificada em container isolado (`/healthz=ok`) e ativada com `stop-first`, rollback automático e período de observação. O Swarm convergiu para 1/1 réplica; o endpoint público confirmou `healthz=ok` e o mesmo SHA em `/version.json`. Houve contenção transitória da porta host-mode durante a troca, resolvida sem rollback. Imagem de rollback preservada: `easypanel/elolab/app:deploy-20261030-6fa4c9f`. Nenhuma migration ou alteração de dados de produção.
