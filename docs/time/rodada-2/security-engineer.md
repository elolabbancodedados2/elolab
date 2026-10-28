# Rodada 2: security-engineer

## O que fiz

- Verifiquei os dois P0 suspeitos lendo o código. O relatório completo está em `docs/seguranca/auditoria-rodada-2.md`.
  - **CLIN-QA-512 confirmado e reclassificado como P0.** O rebaixamento da rodada 1 partia de que o CPF do titular não é digitado pelo usuário. Ele é, sim: pelo agendamento público. A cadeia tem quatro passos:
    1. Sem sessão, alguém agenda com o CPF de um responsável que não é paciente da clínica, informando a própria data de nascimento e os próprios contatos (`public-booking/index.ts:221-235`).
    2. Em seguida, pede acesso ao portal (`patient-portal/index.ts:934-963`). O link chega aos contatos que essa pessoa informou.
    3. Com o link, vê a lista de dependentes (`index.ts:142`, `acessoPortal.ts:128-133`) e lê os dados dos menores.
    4. Também troca o contato do dependente (`index.ts:282-298`).

    A correção que o backend-developer está fazendo (só menores, sem o mesmo CPF, em `acessoPortal.ts:100-114`) **não fecha essa cadeia**.
  - **CLIN-QA-545 mantido como P0 suspeito, não derrubado.** Confirmei que o diálogo exibe `selectedPaciente` (`Prontuarios.tsx:2006`, `:2070-2077`, `:2355`, `:2398`) e grava `currentProntuario.paciente_id` (`:1271`), sem nenhuma conferência entre os dois. Há um caminho plausível (H1): o clique no rascunho (`:1682-1686`) não invalida o `requestId` de `handleViewProntuario` (`:977-986`). Esse caminho não foi reproduzido.
- Revisei as mudanças da rodada 1:
  - `public-booking`: oráculo pela agenda, 409 revelador e cópias de dados pessoais;
  - `whatsapp-webhook`: oráculo de existência do CPF (o 561 do QA, confirmado), CPF com nascimento como fator único e triagem sem identificação;
  - migration LGPD `20261028100000`: cópias de dados pessoais não alcançadas, nenhuma exigência de MFA para uma operação irreversível, e `search_path` fora do padrão.
- Novos itens: CLIN-QA-571 a 579 (faixa da segurança).

## Arquivos tocados

- `docs/seguranca/auditoria-rodada-2.md` (novo)
- `docs/time/rodada-2/security-engineer.md` (este arquivo)

Não editei código.

## Evidências

- O conteúdo exato que li está registrado por `git hash-object` na tabela do início da auditoria. O `patient-portal/index.ts` mudou durante a leitura (o backend-developer extraiu `acessoPortal.ts`), e as linhas citadas foram conferidas de novo no estado final, às 19:19.
- `git diff HEAD -- supabase/functions/whatsapp-webhook/index.ts`: o vínculo por `telefone.ilike` foi removido e a conversa nasce com `paciente_id: null`.
- `git show HEAD:src/pages/Prontuarios.tsx | grep -c "NÃ£o"` devolveu `1`: o texto com codificação corrompida em `:1153` já estava no HEAD (P3).
- Formato de `audit_log.changes` (`{campo: {de, para}}`) conferido em `20261001200000_caixa_diario_eventos_e_reabertura.sql:160-166`. Em `audit_log`, não há trigger de imutabilidade que derrube o `UPDATE` da anonimização.
- Nada foi executado: sem Deno, sem Supabase local e sem VPS. As conclusões têm nível E1.

## Pendências

1. **CLIN-QA-512 (P0):**
   - contenção: desligar dependentes no portal ou exigir titular confirmado;
   - vínculo explícito `paciente_responsaveis` **[AE]**;
   - cadastro do link público como pré-cadastro, sem acesso ao portal;
   - `update_contact` só no titular;
   - registro de acesso como dependente.

   Dono: backend-developer. O responsável precisa rodar a consulta só leitura da seção 2.5 da auditoria para medir a exposição atual.
2. **CLIN-QA-545:**
   - guarda `currentProntuario.paciente_id === selectedPacienteId` antes de gravar;
   - diálogo lendo o paciente do registro;
   - incremento do `requestId` no clique do rascunho;
   - fechar o diálogo quando o paciente mudar.

   Dono: frontend-developer. O teste de H1 fica com o qa-engineer.
3. **Migration LGPD:**
   - itens 578 (cópias em tarefas sem paciente, `agendamentos.observacoes` e `audit_log` de `agendamentos`) e 579 (exigir `aal2`);
   - `search_path = ''`;
   - parecer do DPO **[AE]**.

   Dono: backend-developer e database-engineer.
4. Os oráculos 572, 573 e 576 vão para o backend-developer. CLIN-QA-312 (rate limit que falha aberto e IP forjável) e CLIN-QA-316 (chave global da Evolution) continuam abertos.
5. Decisão C5 (conversas herdadas do WhatsApp): responsável.

## Próximo dono

backend-developer (512, prioridade 1), frontend-developer e qa-engineer (545), e o diretor de qualidade, para registrar no consolidado a volta do 512 a P0.
