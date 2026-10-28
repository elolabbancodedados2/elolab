# Rodada 3: frontend-developer

Data: 27/10/2026. Sem deploy, sem migration, sem commit e sem acesso à VPS.

## 1. O que fiz

Escrevi o teste de tela do CLIN-QA-555 (critério U2 de `docs/time/GATES.md`): `src/pages/__tests__/ProntuariosPacienteDoRegistro.test.tsx`.

O teste renderiza a página real `src/pages/Prontuarios.tsx` com `MemoryRouter` e React Query reais. O Supabase é simulado e registra cada escrita (`insert`, `update`, `upsert`, `delete`) com tabela, payload e filtros `eq`, além de cada `rpc`. Os mocks cobrem auditoria, busca de pacientes e componentes clínicos laterais. Todos os dados são sintéticos ("Ana Sintética" e "Bruno Sintético").

| Caso | Cenário | O que o teste confere |
|---|---|---|
| CA1 | `?paciente=pac-a`, "Novo Atendimento", digitar a queixa, salvar | Um único `insert` em `prontuarios` com `paciente_id: 'pac-a'` e `clinica_id: 'clinic-1'` |
| CA2 | Diálogo de A aberto, sem alterações; a rota muda para `?paciente=pac-b` | O diálogo fecha, aparece o aviso "O prontuário foi fechado porque o paciente selecionado mudou.", a ficha de B aparece e não há escrita |
| CA3/CA4 | Diálogo de A com texto digitado; a rota muda para B | O diálogo fica aberto com `role="alert"` ("A gravação está bloqueada"), não mostra B, o botão "Salvar Prontuário" fica desabilitado, o clique não grava, o salvamento automático (relógio avançado 31 s) não grava nem chama `rpc`. Depois de descartar e abrir o atendimento de B, o `insert` sai com `paciente_id: 'pac-b'` e sem o texto digitado para A |
| CA5 (H1), variante 1 | A abertura da evolução de A está pendente na auditoria; o médico clica no rascunho de B e a resposta de A chega no mesmo instante | O registro de A não chega a abrir para edição. O diálogo mostra o rascunho de B, não aparece o aviso de divergência, e o `update` sai com `eq('id', 'rasc-b')` |
| CA5 (H1), variante 2 | A resposta de A chega depois que B já abriu e entrou em edição | O diálogo continua em B, sem A e sem alerta. O `update` sai com `id = rasc-b` e nunca com `pront-a`. A única `rpc` é `substituir_prescricoes_do_prontuario` com `p_prontuario_id: 'rasc-b'` |

**Resultado: o teste passou de primeira contra o código atual.** Por isso não alterei `src/pages/Prontuarios.tsx`.

### O teste detecta a falha (mutação)

Copiei `Prontuarios.tsx` para o scratchpad, retirei uma correção por vez, rodei o teste e restaurei a cópia. O SHA-1 do arquivo restaurado é igual ao original (saída `RESTAURADO_OK`).

| Mutação | Teste que falhou |
|---|---|
| M1: guarda de `performSave` desligada (`:1205`; o `sed` também desligou a guarda da solicitação de exame em `:1550`) | CA3/CA4 |
| M2: sem `prescricoesRequestRef.current += 1` no clique do rascunho (`:1712`) | CA5, variante 1 |
| M3: efeito que fecha o diálogo desligado (`:1515`) | CA2 |
| M4: guarda desligada e botão de salvar sem `pacienteDialogoDiverge` (`:2601`) | CA3/CA4 |

Com isso, os três testes da rodada 2 que só leem o código-fonte deixam de ser a única prova: o comportamento de CA1 a CA5 agora tem evidência E2 em tela.

## 2. Arquivos tocados

- `src/pages/__tests__/ProntuariosPacienteDoRegistro.test.tsx` (novo)
- `docs/time/rodada-3/frontend-developer.md` (este arquivo)

Durante a mutação, `src/pages/Prontuarios.tsx` foi alterado e restaurado byte a byte. O `M` que ele mostra no `git status` vem das rodadas anteriores. Criei um teste temporário (`src/pages/__tests__/zzTmpRotaRascunho.test.tsx`) para a hipótese da seção 4 e o removi em seguida.

## 3. Evidências

| Comando | Resultado |
|---|---|
| `npx vitest run src/pages/__tests__/ProntuariosPacienteDoRegistro.test.tsx` | 1 arquivo, 5 de 5 testes passaram (7,1 s) |
| Mesmo comando com as mutações M1 a M4 | Cada mutação: 1 falhou e 4 passaram, no caso esperado (tabela acima) |
| `npx eslint src/pages/__tests__/ProntuariosPacienteDoRegistro.test.tsx` | "No issues found" |
| `npm run check:a11y` | "OK — controles têm nome acessível e não há interativos aninhados." |
| `npm run check:falhas` | "0 caso(s) em 0 arquivo(s)" |
| `npx tsc --noEmit -p tsconfig.app.json` | **Não executado**, pela regra da rodada. O vitest transpila sem checar tipos, então os tipos do arquivo novo ficam para a verificação completa |
| `npm run lint` completo | **Não executado**, pela mesma regra |

## 4. Achado lateral (E2, não corrigido)

**Com `?paciente=A` na URL, o clique no rascunho de B não abre nada.** O clique chama `setSelectedPacienteId('pac-b')` (`Prontuarios.tsx:1715`). O efeito em `:954-959` vê `routePacienteId = 'pac-a'` diferente do selecionado e volta para A. O efeito do rascunho (`:1158`) exige `selectedPacienteId === rascunho.paciente_id` e nunca executa. Pela leitura do código (E1), a busca manual de outro paciente em `:1754-1760` cai no mesmo efeito.

Reproduzi com um teste temporário: depois de 800 ms, `{ dialogo: false, acessos: [] }`. Nada é gravado no paciente errado, por isso não é P0. Classifico como **P2** (fluxo do médico quebrado quando ele chega pela Fila, com contorno: limpar o atalho). Não corrigi porque o teste da tarefa passou e a mudança altera o comportamento do atalho da Fila. Proposta: ao selecionar um paciente manualmente (rascunho ou busca), remover `paciente` e `agendamento` da URL com `setSearchParams(..., { replace: true })`.

## 5. Pendências

| Pendência | Dono |
|---|---|
| `tsc` completo, `vitest` completo e lint da rodada | qa-engineer ou tech-lead |
| Abrir item de backlog para o achado da seção 4 (P2) e decidir se a seleção manual limpa o atalho | product-owner; correção pelo frontend-developer |
| CA6 (perfil sem permissão de edição) e CA7 (`paciente_id` de outra clínica na rota) continuam sem teste. O CA7 depende de RLS e precisa do teste de duas clínicas | qa-engineer e database-engineer |
| E3: repetir o roteiro U2 em homologação; não existe staging | devops-sre, depois qa-engineer |
| Revisão de UX do aviso de CA3 (texto do `role="alert"`) | product-designer |
| Texto com codificação corrompida em `Prontuarios.tsx` (`:1162-1174`, `:1527`, `:1534`; P3, já existia) | frontend-developer, próxima rodada |

## 6. Próximo dono

product-owner, para reavaliar o CLIN-QA-555 com o teste de tela (CA1 a CA5 em E2). Depois o qa-engineer, para a verificação completa da rodada.
