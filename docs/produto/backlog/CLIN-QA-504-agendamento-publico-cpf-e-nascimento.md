# CLIN-QA-504: Agendamento público vincula o paciente só com CPF e data de nascimento iguais

| Campo | Valor |
|---|---|
| Item de origem | CLIN-QA-003 (102, 306), caso (a) |
| Gravidade | P0 |
| Impacto | Clínico. Consulta gravada no cadastro de outra pessoa |
| Perfil | Paciente pelo link público; recepção (trata a pendência) |
| Esforço | S |
| Dono sugerido | `backend-developer` (edge function); `frontend-developer` (tela); `qa-engineer` (roteiro) |
| Dependências | Nenhuma de banco: `tarefas` e `find_patient_id_by_normalized_cpf` já existem (`docs/time/planos/ESTAB-7D-itens-3-4.md`) |
| Status | Feito localmente (27/10, após a rodada 2) |

## Contexto
O link público reaproveitava o paciente só pelo CPF (RPC com `LIMIT 1`). Nome e telefone informados iam só para `observacoes`. Quem digita o CPF de outra pessoa marca consulta no prontuário dela.

## Evidência
- Diagnóstico D.1 #5: `supabase/functions/public-booking/index.ts:196-198,239` no estado auditado.
- Estado atual do worktree: `public-booking/index.ts:190-191` ("só reaproveita quando há um único cadastro com o CPF e o nascimento confere"). Ainda não validado por teste executado.

## Proposta
Nascimento obrigatório na tela e na função. Um candidato com o mesmo nascimento: agenda nele. Nascimento divergente, ausente no cadastro ou mais de um cadastro com o CPF: cria pendência em Tarefas para a recepção, sem vincular nem agendar. A mensagem ao paciente é a mesma em todos os casos.

## Critérios de aceite
- **CA1 (caminho principal).** Dado um paciente da clínica A com CPF X e nascimento D, quando alguém agenda pelo link da clínica A com CPF X e nascimento D, então o agendamento é criado nesse paciente.
- **CA2 (paciente novo).** Dado um CPF sem cadastro na clínica A, quando alguém agenda com CPF e nascimento válidos, então um paciente é criado com o nascimento informado e o agendamento é feito nele.
- **CA3 (divergência).** Dado o CPF X cadastrado com nascimento D, quando alguém agenda com CPF X e nascimento diferente (e outro nome), então nenhum agendamento é criado, nenhum dado do cadastro existente muda, e surge em Tarefas uma pendência "Agendamento online pendente" com o pedido e o CPF mascarado.
- **CA4 (ambíguo).** Dado o CPF X em dois cadastros da clínica A, ou um cadastro sem nascimento, quando alguém agenda com CPF X, então o pedido vira pendência e nada é vinculado.
- **CA5 (outra clínica).** Dado o CPF X cadastrado só na clínica B, quando alguém agenda pelo link da clínica A com CPF X, então a busca não encontra o cadastro da B, um paciente novo é criado na A (ou pendência, se houver ambiguidade na A), e nada da B é lido ou alterado.
- **CA6 (sem enumeração).** Em CA1, CA3 e CA4 a resposta ao paciente tem o mesmo texto e o mesmo código HTTP. Ela não revela se o CPF existe nem qual nascimento está cadastrado.
- **CA7 (validação e erro).** Dado um envio sem nascimento, com data inválida ou futura, quando o paciente envia, então a tela bloqueia antes do envio e a função também recusa (400) com mensagem traduzida, sem texto técnico.
- **CA8 (permissão negada / abuso).** Dado o limite de requisições do link público, quando ele é excedido, então a função recusa sem criar paciente, agendamento ou tarefa.
- **CA9 (tom).** Mensagens sem exclamação nem emoji.

## Definição de pronto
DoD comum, mais: testes unitários do helper cobrindo CA1 a CA4 (`src/lib/__tests__/identificacaoPaciente.test.ts`); casos do roteiro do QA (ESTAB-7D, passos 2 a 5) executados em homologação com dados sintéticos e anexados; revisão de segurança da rota pública.

## Situação após as rodadas 1 e 2

Revisão do PO em 27/10/2026. Estado no fluxo de `docs/time/GATES.md` 1.1: **testado localmente (E2)**. Nada desta história foi aplicado em banco, publicado ou commitado.

### O que existe
- `supabase/functions/public-booking` só vincula com CPF e data de nascimento (contenção 7.4 do tech-lead, rodada 1; Playwright do agendamento 8 de 8 na rodada 1).
- A auditoria da rodada 2 confirmou o caminho, mas abriu CLIN-QA-571 (P0): o link público cria titular com CPF de terceiro e contatos próprios (`public-booking/index.ts:221-235`), o que alimenta a cadeia do CLIN-QA-512. Também abriu 572 (oráculo pela agenda, P2), 573 (409 revelador, P2, mesmo achado do 562 do QA) e 574 (cópias de dado pessoal em tarefa e `observacoes`, P2).
- `deno check` desta função: NÃO VERIFICADO.

### O que falta
- 571: o cadastro criado pelo link vira pré-cadastro, sem acesso ao portal até a conferência na recepção (critério CA-R2 abaixo).
- Publicação e casos (a) e (b) do CLIN-QA-003 em homologação.

### Critérios acrescentados na rodada 2
- **CA-R2 (571).** Dado um visitante que agenda pelo link com um CPF que não existe na clínica, quando pede acesso ao portal com esse CPF, então o acesso é negado até a recepção conferir o documento, com mensagem traduzida e igual à de CPF inexistente.

### Validação do PO
Não aceita. Nenhum critério de aceite tem evidência em homologação (E3).
