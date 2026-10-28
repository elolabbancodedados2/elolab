# CLIN-QA-555: O prontuário grava sempre no paciente exibido

| Campo | Valor |
|---|---|
| Item de origem | Achado F da UX (antigo CLIN-QA-545, renumerado para 555 no consolidado da rodada 1); critério U2 de `docs/time/GATES.md` |
| Gravidade | **P0 suspeito.** Bloqueia o gate S1 até ser derrubado por teste (`GATES.md`, seção 3) |
| Impacto | Clínico. Evolução, prescrição ou conduta gravada no prontuário de outro paciente |
| Perfil | Médico e enfermagem no prontuário |
| Esforço | S |
| Dono sugerido | `qa-engineer` (teste de reprodução), `frontend-developer` (correção) |
| Dependências | Nenhuma. Deve entrar junto com a integração da CLIN-QA-524 |
| Status | Feito localmente (27/10, após a rodada 2). Continua P0 suspeito até o teste de tela do critério U2 |

## Contexto
O diálogo de evolução mostra um paciente e grava com o identificador de outro estado da tela. Os dois estados são independentes e nada confere um contra o outro antes de gravar.

## Evidência (E1, conferida pelo diretor na rodada 1 e pela segurança na rodada 2)
- O diálogo exibe `selectedPaciente` (`src/pages/Prontuarios.tsx:2006`, `:2070-2077`, `:2355`, `:2398`).
- A gravação usa `currentProntuario.paciente_id` (`:1271`), definido quando o diálogo abre (`:925-927`).
- Quando a rota muda, `selectedPacienteId` troca (`:946-950`) sem fechar o diálogo.
- Caminho plausível (H1, da segurança): o clique no rascunho (`:1682-1686`) não invalida o `requestId` de `handleViewProntuario` (`:977-986`).
- Alcance na interface: NÃO VERIFICADO. As linhas podem ter mudado com a correção da rodada 2.

## Proposta
1. Antes de gravar, conferir `currentProntuario.paciente_id === selectedPacienteId`. Se divergir, não gravar e mostrar erro traduzido.
2. O diálogo lê o paciente do próprio registro em edição.
3. Fechar o diálogo, ou bloquear a troca com alterações pendentes, quando o paciente da rota mudar.
4. Invalidar o `requestId` no clique do rascunho.

## Critérios de aceite
- **CA1 (caminho principal).** Dado o diálogo de evolução aberto para o paciente A, quando o médico salva, então o registro fica com o `paciente_id` de A, e o cabeçalho de identificação mostra A.
- **CA2 (troca de rota com o diálogo aberto).** Dado o diálogo aberto para A sem alterações, quando a rota muda para B (pela Fila ou por link), então o diálogo fecha antes de mostrar B.
- **CA3 (troca com alterações pendentes).** Dado o diálogo aberto para A com texto digitado, quando a rota muda para B, então a troca é bloqueada com aviso, ou o rascunho continua ligado a A e nada é gravado em B.
- **CA4 (erro).** Dado um estado em que o paciente exibido difere do paciente do registro, quando o médico salva, então nada é gravado e aparece uma mensagem traduzida que pede para reabrir o prontuário.
- **CA5 (rascunho, H1).** Dado o carregamento do prontuário de A em andamento, quando o médico clica no rascunho de B, então a resposta de A que chega depois não altera o diálogo de B.
- **CA6 (permissão negada).** Dado um perfil sem permissão de edição clínica, quando abre o prontuário, então o diálogo de edição não aparece, e a gravação direta é recusada pela RLS.
- **CA7 (outra clínica).** Dado um `paciente_id` da clínica B posto na rota por um usuário da A, quando o prontuário abre, então nenhum dado de B aparece e nada é gravado.

## Definição de pronto
DoD comum, mais: teste automatizado que abre a evolução de A, troca a rota para B com o diálogo aberto e confere o `paciente_id` gravado (critério U2 do gate, E2 localmente e E3 em homologação); teste de CA4 e CA5; revisão de UX do aviso de CA3.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026, depois do resumo `docs/time/rodada-2/frontend-developer.md`. Estado no fluxo de `docs/time/GATES.md` 1.1: **correção escrita (E1), com a guarda em E2 como função isolada**. Nada foi publicado nem commitado. O item **continua P0 suspeito**: o critério U2 pede teste de tela que troca a rota e confere o `paciente_id` gravado, e esse teste não existe.

### Conferência por critério

| Critério | Evidência | Situação |
|---|---|---|
| CA1 | O diálogo usa `pacienteDoDialogo`, que só existe quando o paciente carregado é o do registro (`src/pages/Prontuarios.tsx:884-886`); identificação em `:2110` | E1. NÃO VERIFICADO na tela |
| CA2 | Efeito que fecha o diálogo quando o paciente diverge e não há alteração (`:1511-1518`, lido pelo PO) | E1 |
| CA3 | Com alteração pendente, o diálogo fica travado, o botão de salvar desabilita (`:2601`, segundo o frontend) e a guarda recusa a gravação | E1 |
| CA4 | Guarda antes da primeira escrita, com mensagem traduzida e nenhuma gravação (`:1204-1210`, lido pelo PO); vale para salvamento manual, automático e dispensação | E2 para a função `pacienteDivergeDoRegistro` (teste abaixo); E1 para a tela |
| CA5 | O clique no rascunho incrementa `prescricoesRequestRef` (`:1712`, lido pelo PO) | E1, mais um teste que lê o código-fonte. H1 não foi reproduzido |
| CA6 | Sem mudança nesta rodada | NÃO VERIFICADO |
| CA7 | Sem mudança nesta rodada | NÃO VERIFICADO |

Achado extra corrigido pelo frontend no mesmo padrão: a solicitação de exame gravava `paciente_id: selectedPacienteId` e agora usa o paciente do registro (`:1547-1561`, segundo o frontend).

Reexecutado pelo PO: `npx vitest run src/lib/__tests__/pacienteDoRegistro.test.ts src/components/clinical/__tests__/IdentificacaoPaciente.test.tsx` → 2 arquivos, 35 de 35. Três desses testes conferem o texto do código-fonte de `Prontuarios.tsx` (ordem da guarda, ausência de `selectedPaciente` no diálogo, incremento no rascunho). São úteis como trava contra regressão, mas não provam o comportamento.

### O que falta
- qa-engineer: teste de tela que abre a evolução de A, troca a rota para B com o diálogo aberto e confere o `paciente_id` gravado (U2), mais a simulação de H1.
- Verificação completa da rodada (`tsc`, `vitest`, lint), com o tech-lead.

### Validação do PO
Não aceita. CA1 a CA5 têm correção escrita e coerente com a proposta; CA6 e CA7 não foram tratados; falta o teste de tela exigido pelo gate.
