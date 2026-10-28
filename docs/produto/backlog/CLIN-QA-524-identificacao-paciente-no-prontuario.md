# CLIN-QA-524: Identificação completa do paciente na edição do prontuário

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-012 (401), ação 60.1 |
| Gravidade | P1. Passa a P0 se o teste com usuários registrar seleção do paciente errado |
| Impacto | Clínico. Evolução, prescrição ou atestado gravados no paciente errado |
| Perfil | Médico |
| Esforço | S (integração; o componente vem da rodada 1) |
| Dono sugerido | `frontend-developer`; especificação do `product-designer` |
| Dependências | Componente `src/components/clinical/IdentificacaoPaciente.tsx` (rodada 1, `frontend-developer`, sem integração); especificação `docs/ux/telas/identificacao-paciente.md` (rodada 1, `product-designer`); `src/pages/Prontuarios.tsx` tem alterações de outra frente: integrar só depois que ela for commitada |
| Status | Feito localmente (27/10, após a rodada 2) |

## Contexto
A faixa no topo da edição mostra o nome em 10 px, a idade como "42a", o CPF completo e não mostra nascimento nem alergias.

## Evidência
- `src/pages/Prontuarios.tsx:2069-2080` (conferido nesta rodada): `text-[10px]` no nome, `${calcularIdade(...)}a`, CPF sem máscara, sem alergias.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um médico editando o prontuário de um paciente, quando o diálogo abre, então nome completo (no mínimo 14 px), data de nascimento, idade, alergias e convênio aparecem sem rolagem, em tela de 1366×768.
- **CA2 (alergias).** Dado um paciente com alergias, quando o diálogo abre, então elas aparecem em destaque de estado; sem alergia registrada, aparece "Sem alergias registradas"; sem informação, "Alergias não informadas".
- **CA3 (CPF).** O CPF aparece mascarado (`***.***.***-12`); a revelação segue a CLIN-QA-526.
- **CA4 (outra clínica).** Dado um médico da clínica A, quando abre por URL um prontuário de paciente da clínica B, então nada é exibido e a tela mostra "Paciente não encontrado", sem dado da B na faixa.
- **CA5 (permissão negada).** Dado um usuário sem permissão de prontuário (por exemplo, recepção ou financeiro), quando tenta abrir a edição, então o acesso é negado e a faixa não aparece.
- **CA6 (erro e carregamento).** Dada falha ao carregar o paciente, quando ocorre, então a edição fica bloqueada (não se grava sem identificação) e aparece a mensagem traduzida.
- **CA7 (acessibilidade).** A faixa é lida por leitor de tela como região "Identificação do paciente"; `npm run check:a11y` passa.

## Definição de pronto
DoD comum, mais: teste de componente cobrindo CA1 a CA3 e CA6; captura em 1366×768 anexada.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **correção escrita (E1); componente e conversão em E2**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- Componente `src/components/clinical/IdentificacaoPaciente.tsx` com `src/lib/identificacaoPaciente.ts` (frontend-developer, rodada 1), conforme `docs/ux/telas/identificacao-paciente.md`.
- Rodada 2: a faixa antiga do diálogo em edição (nome em `text-[10px]`, CPF completo) foi trocada pelo componente na variante `dialogo` (`src/pages/Prontuarios.tsx:2110`, import em `:62`, conferido pelo PO). A conversão do cadastro está em `src/lib/pacienteDoRegistro.ts` (`paraIdentificacao`), que transforma `alergias = '{}'` em "Alergias não informadas".
- Reexecutado pelo PO: `npx vitest run src/lib/__tests__/pacienteDoRegistro.test.ts src/components/clinical/__tests__/IdentificacaoPaciente.test.tsx` → 2 arquivos, 35 de 35.
- O achado 554 da UX (antigo 544) é esta história. O 555 tem história própria e entrou junto.
- NÃO VERIFICADO: o diálogo não foi aberto no navegador; não há teste de renderização da tela de prontuário com o componente; `tsc` fica para a verificação final da rodada.

### O que falta
- Testes manuais da seção 10 da especificação (1366 × 768, 360 × 640, leitor de tela, zoom de 200%) pelo qa-engineer.
- Integração em Prescrições e Triagem (frontend-developer, próxima rodada).
- Campo que distingue "nega alergia" de "não perguntado" (business-analyst e database-engineer).

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
