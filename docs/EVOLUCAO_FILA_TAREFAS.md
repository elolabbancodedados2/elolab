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

Uma URL direta para a passagem de turno sem o snapshot de navegação apresenta uma orientação para gerar outro resumo pela Fila. A operação de remoção continua sujeita à revalidação da RPC; alterações concorrentes voltam à fila para nova conferência. A etapa de Recepção ainda requer auditoria integrada além das tarefas desta página; as etapas clínicas e de plataforma também continuam abertas.

## Publicação

Commit `53dc69426f9e09d6e87676a2129add68fd4b7bd8`; imagem `easypanel/elolab/app:deploy-20261030-53dc694`. A imagem foi construída do arquivo versionado com o SHA integral, verificada em container isolado (`/healthz=ok`) e ativada com `stop-first`, rollback automático e período de observação. O Swarm convergiu para 1/1 réplica; o endpoint público confirmou `healthz=ok` e o mesmo SHA em `/version.json`. Houve contenção transitória da porta host-mode durante a troca, resolvida sem rollback. Imagem de rollback preservada: `easypanel/elolab/app:deploy-20261030-6fa4c9f`. Nenhuma migration ou alteração de dados de produção.
