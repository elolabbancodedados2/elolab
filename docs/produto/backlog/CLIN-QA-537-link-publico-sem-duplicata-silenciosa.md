# CLIN-QA-537: Link público não cria cadastro duplicado em silêncio

| Campo | Valor |
|---|---|
| Item de origem | Lacuna L-ID-03 do business-analyst (`docs/produto/processos/identificacao-paciente-canais-publicos.md:196`) |
| Gravidade | P1 (prontuário dividido entre dois cadastros) |
| Impacto | Clínico. Histórico e alergias ficam no cadastro antigo; o atendimento é feito no novo |
| Perfil | Recepção; paciente que agenda pelo link |
| Esforço | S |
| Dono sugerido | `backend-developer` + `frontend-developer` |
| Dependências | 504; 512 e 571 (o cadastro do link vira pré-cadastro) |
| Status | Aberto (27/10, criada na rodada 2) |

## Contexto
Um paciente antigo sem CPF no cadastro agenda pelo link com o CPF. O sistema não acha ninguém pelo CPF e cria outro cadastro, sem avisar a recepção.

## Evidência (E1, business-analyst; não reconferida pelo PO)
- `supabase/functions/_shared/identificacaoPaciente.ts:75`
- O índice único permite CPF nulo: `supabase/migrations/20260815150000_cpf_unico_por_clinica_e_sem_mascara.sql:100-102`

## Critérios de aceite
- **CA1 (caminho principal).** Dado um pedido pelo link que gerou cadastro novo, quando existe na clínica um paciente sem CPF com o mesmo nome e a mesma data de nascimento, então a recepção vê o aviso de possível duplicata na pendência antes de confirmar.
- **CA2 (unir).** Dado o aviso, quando a recepção confirma que é a mesma pessoa, então o agendamento passa para o cadastro antigo e o pré-cadastro é descartado com registro.
- **CA3 (erro).** Dada uma falha ao unir, quando acontece, então nada fica pela metade e a mensagem é traduzida.
- **CA4 (permissão negada).** Dado um perfil sem papel de recepção ou administrador, quando tenta unir cadastros, então é negado.
- **CA5 (outra clínica).** Dado um paciente da clínica B com o mesmo nome e nascimento, quando a A recebe o pedido, então nenhum aviso cita o paciente da B.
- **CA6 (sem oráculo).** Dado o visitante que fez o pedido, quando recebe a resposta, então ela é a mesma havendo ou não possível duplicata.

## Definição de pronto
DoD comum, mais: teste de CA1, CA5 e CA6 na função; revisão do `security-engineer` para CA6.
