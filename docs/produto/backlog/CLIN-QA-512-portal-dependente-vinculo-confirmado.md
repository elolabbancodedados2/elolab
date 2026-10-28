# CLIN-QA-512: Portal do paciente mostra dependente só com vínculo confirmado pela clínica

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-003 (310); achados 571 (segurança) e TL-R2-01 (tech-lead) |
| Gravidade | **P0 confirmado por leitura de código** na rodada 2 (`docs/seguranca/auditoria-rodada-2.md`, seção 2). O rebaixamento a P1 da rodada 1 foi revertido |
| Impacto | Clínico e LGPD. Um terceiro pode ler consultas, exames e documentos de um menor e trocar o contato dele |
| Perfil | Paciente titular no portal; recepção (confirma o vínculo); administrador da clínica |
| Esforço | M (contenção: S) |
| Dono sugerido | Contenção: `backend-developer`. Vínculo explícito: `database-engineer` (modelo), `frontend-developer` (tela na recepção) e `backend-developer` (portal). Revisão: `security-engineer` e DPO |
| Dependências | Decisão do responsável sobre o que está publicado na VPS; parecer do DPO sobre a regra dos 18 anos e sobre dependentes adultos (curatela) **[requer avaliação especializada]** |
| Status | Aberto (27/10, após a rodada 2). Mitigação parcial no código local, que não fecha a cadeia |

## Contexto
O portal troca o paciente da sessão para um dependente, e isso passa a valer para consultas, exames, documentos e agendamento. O único vínculo entre titular e dependente é o texto `cpf_responsavel`, digitado no cadastro e nunca confirmado. Não existe coluna nem tabela de vínculo explícito (backend-developer, rodada 2).

## Evidência

### Cadeia confirmada pela segurança na rodada 2 (E1)
1. Sem sessão, alguém agenda pelo link público com o CPF de um responsável que não é paciente da clínica, informando a própria data de nascimento e os próprios contatos (`supabase/functions/public-booking/index.ts:221-235`, achado 571).
2. Em seguida, pede acesso ao portal (`supabase/functions/patient-portal/index.ts:934-963`). O link chega aos contatos que essa pessoa informou.
3. Com o link, vê a lista de dependentes (`index.ts:142`, `acessoPortal.ts:128-133`) e lê os dados dos menores.
4. Também troca o contato do dependente (`index.ts:282-298`), o que o tech-lead confirmou por leitura.

### Mitigação local da rodada 2 (não fecha a cadeia)
- `supabase/functions/patient-portal/acessoPortal.ts:100-114` (`filtrarDependentesElegiveis`): só menores de 18 anos, com data de nascimento válida, e com CPF diferente do titular. A mesma regra vale para `get_dependentes` e para `dependente_id` (`index.ts:104-126`, `:141-142`).
- Testes Deno do backend: `npx -y deno@2 test ... supabase/functions/patient-portal/` → 38 passed (backend-developer; reexecutado pelo tech-lead). Não reexecutado pelo PO.
- A segurança e o tech-lead (TL-R2-01) confirmam: o menor da cadeia acima continua visível.

### Fato novo do tech-lead
A funcionalidade de dependentes **não existe no `HEAD`** (`git show HEAD:supabase/functions/patient-portal/index.ts | grep -c dependente` → `0`, conferido pelo PO em 27/10). Ela vem de alterações locais de outra frente. Se não estiver publicada, a contenção mais barata é não publicar `get_dependentes` nem `dependente_id`. Se já estiver publicada na VPS (NÃO VERIFICADO), o ramo precisa ser desligado.

## Proposta
1. **Contenção (S, prioridade 1).** Dependentes desligados no portal até existir o vínculo confirmado. `update_contact` só altera o titular.
2. **Pré-cadastro no link público (571).** O titular criado pelo link não ganha acesso ao portal até a recepção conferir o documento.
3. **Vínculo explícito.** `responsavel_paciente_id` (ou tabela `paciente_responsaveis`) da mesma clínica, com `vinculo_confirmado_em` e `vinculo_confirmado_por`, confirmado na recepção com documento conferido. A regra de maioridade continua.
4. **Rastro.** Registro de cada acesso feito como dependente.

## Critérios de aceite
- **CA0 (contenção).** Dado o portal publicado antes do vínculo explícito, quando qualquer titular chama `get_dependentes` ou envia `dependente_id`, então recebe lista vazia ou 403 com mensagem traduzida, e `update_contact` nunca altera outro paciente que não o titular.
- **CA1 (caminho principal).** Dado um dependente menor com vínculo confirmado pela recepção da clínica A, quando o titular acessa o portal, então vê e alterna para o dependente.
- **CA2 (vínculo não confirmado).** Dado um paciente com `cpf_responsavel` igual ao CPF do titular, mas sem confirmação, quando o titular acessa o portal ou envia `dependente_id` dele, então o dependente não aparece e a chamada retorna 403 com mensagem traduzida.
- **CA3 (outra clínica).** Dado um dependente confirmado na clínica B, quando o titular acessa o portal da clínica A, então ele não aparece, e um `dependente_id` da B forjado retorna 403.
- **CA4 (permissão negada).** Dado um usuário da clínica sem papel de recepção ou administrador, quando tenta confirmar um vínculo, então é negado.
- **CA5 (auditoria).** Dada a confirmação, a revogação ou o acesso como dependente, quando acontece, então fica registrado com usuário, data e paciente.
- **CA6 (migração).** Dados os vínculos já existentes por `cpf_responsavel`, quando a mudança entra, então nenhum fica confirmado automaticamente sem decisão registrada do responsável e do DPO.
- **CA7 (cadeia 571).** Dado um visitante que agendou pelo link com o CPF de um terceiro, quando pede acesso ao portal com esse CPF, então não recebe link nem vê dependentes até a conferência na recepção.
- **CA8 (maioridade).** Dado um dependente que completa 18 anos, quando o titular acessa o portal, então o dependente deixa de aparecer, mesmo com o vínculo confirmado.

## Definição de pronto
DoD comum, mais: testes da função do portal para CA0, CA2, CA3, CA7 e CA8; teste de banco para CA4 e CA6; consulta 2.5 da auditoria executada pelo responsável para medir a exposição atual; parecer do DPO sobre a regra dos 18 anos e sobre dependentes adultos **[requer avaliação especializada]**.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **aberto**. A mitigação local está em E2 para o que cobre, mas não atende CA0, CA2 nem CA7. Nada foi publicado nem commitado.

### O que falta
- Responsável: confirmar se a versão com dependentes está publicada (TL-R2-01) e rodar a consulta 2.5 da auditoria.
- backend-developer: CA0 (contenção), que não depende de decisão.
- database-engineer, frontend-developer e backend-developer: vínculo explícito (CA1 a CA6), depois do parecer do DPO.

### Validação do PO
Não aceita. É P0 aberto e bloqueia o gate S1.
