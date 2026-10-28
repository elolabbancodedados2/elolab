# Processo: faturamento de convênio (autorização, lote, retorno, glosa e recurso)

Autor: `business-analyst`, rodada 1, 27/10/2026.
Escopo: do atendimento de um paciente de convênio até o recebimento da operadora, com glosa e recurso. A autorização prévia entra porque alimenta o lote. Repasse médico fica de fora.
Itens relacionados: CLIN-QA-010 (TISS inexistente), CLIN-QA-023 (texto da autorização), CLIN-QA-529 e CLIN-QA-530 (TISS no backlog), CLIN-QA-006 (drift).

**Conformidade:** TISS (versão, guias, XML, XSD, prazos de envio e de recurso) **requer avaliação especializada**. Este documento não afirma o que a ANS exige. O `especialista-dominio-saude` cobre isso em `docs/produto/dominio/requisitos-regulatorios.md` (ainda não existia quando conferi, às 27/10).

## 0. Estado do código e o que esta análise cobre

- As linhas valem para o worktree `admin-finance-realtime`, branch `feat/recepcao-painel-dia-melhorias`, em 27/10/2026.
- As migrations citadas existem no repositório. Se estão aplicadas na VPS: NÃO VERIFICADO (CLIN-QA-006).
- Nenhum fluxo foi executado. As regras foram extraídas por leitura de código.
- Resumo honesto: **o sistema não fatura convênio**. Ele registra um **controle manual** de lotes que a clínica monta e transmite fora do sistema, e acompanha retorno, glosa e recurso por valores digitados.

## 1. Atores e dados

| Ator | Papel no processo |
|---|---|
| Recepção | Cadastra o convênio do paciente, faz o check-in e solicita a autorização |
| Faturista (perfil com acesso financeiro) | Monta o lote fora do sistema, registra lote, envio, retorno e glosas, e prepara o recurso |
| Operadora | Recebe as guias pelo próprio portal, paga, glosa e julga o recurso. Não há integração |
| Financeiro | Concilia o recebimento no fluxo de caixa |

Dados: `convenios` (`versao_tiss`, `registro_ans`, `prazo_retorno`, `taxa_glosa`, `valor_consulta`), `pacientes` (`convenio_id`, `numero_carteira`, `validade_carteira`), `precos_consulta_convenio`, `precos_exames_convenio`, `autorizacoes_convenio`, `agendamentos`, `lancamentos`, `lotes_tiss` e `glosas_convenio`.

Permissão: todas as operações de lote e glosa exigem `can_access_financial(auth.uid())` e a clínica do usuário (`supabase/migrations/20260818040000_lotes_tiss_e_glosas.sql:48-66`; RPCs abaixo).

## 2. AS-IS

### 2.1 Fluxo

```
1. Cadastro: paciente com convênio, carteira e validade (Pacientes.tsx)
2. Autorização (opcional): pedido registrado e e-mail à operadora; a resposta não volta ao sistema
3. Check-in: cobrança criada como RECEITA PENDENTE DO PACIENTE, pelo preço do convênio
4. [fora do sistema] Faturista monta as guias e o lote no portal da operadora
5. Novo lote: digita convênio, competência, número, quantidade de guias e valor apresentado → rascunho
6. "Baixar resumo XML" (não é TISS) → transmite pelo portal da operadora → "Registrar envio"
7. Retorno: digita o total recebido acumulado → pago | pago_parcial | processando;
   opcionalmente concilia a diferença no fluxo de caixa
8. Glosa: digita código, motivo, guia (texto livre) e valor
9. Recurso: justificativa → "marcar enviado" → decisão da operadora (aceita com valor recuperado | mantida)
```

### 2.2 Regras extraídas do código

**Autorização e atendimento**

| ID | Regra | Evidência |
|---|---|---|
| RN-FC-01 | A autorização é pedida pela ficha do paciente, com convênio, tipo de serviço e descrição, via RPC `solicitar_autorizacao_convenio`. Se o convênio tem e-mail, o pedido vai por e-mail | `src/components/AutorizacaoConvenioModal.tsx:92-119`; único uso em `src/pages/Pacientes.tsx:2468` |
| RN-FC-02 | A autorização tem status `pendente`, `autorizada`, `negada` ou `expirada` e não tem vínculo com agendamento nem com guia | `supabase/migrations/20260729150000_tabelas_e_campos_que_o_app_usa.sql:140-155` |
| RN-FC-03 | **Não há tela para registrar a resposta da operadora.** Nenhum `update` em `autorizacoes_convenio` em `src` (grep). O aviso diz "até a clínica registrar a resposta" (`AutorizacaoConvenioModal.tsx:116`) | Ver L-FC-03 |
| RN-FC-04 | A validade da carteira é só gravada e validada como data. Nenhum código a confere no agendamento ou no check-in | `src/pages/Pacientes.tsx:938`, `:984`; grep de `validade_carteira` sem outros usos em `src` |
| RN-FC-05 | O check-in usa o convênio **do cadastro do paciente** (`pac.convenio_id`), não o do agendamento | `src/pages/Recepcao.tsx:457`, `:549`, `:595`; o agendamento tem `convenio_id` próprio (`src/components/agenda/hooks/useAgendaColorScheme.ts:70`) |
| RN-FC-06 | Preço da consulta: `valor_particular` do tipo, substituído por `precos_consulta_convenio` quando há preço ativo do convênio; sem tipo no catálogo, cai em `convenios.valor_consulta` | `src/lib/autoBilling.ts:318-372` |
| RN-FC-07 | Preço do exame: o preço do convênio prevalece; o particular é o fallback. Sem preço, o check-in falha | `autoBilling.ts:106-138`, `:201` |
| RN-FC-08 | Tipo do catálogo com valor zero é gratuito e não gera cobrança | `autoBilling.ts:385-391` |
| RN-FC-09 | A cobrança do check-in é `lancamentos` com `tipo = 'receita'`, `status = 'pendente'`, `paciente_id` e `agendamento_id`, **sem `forma_pagamento`, sem `convenio_id` e sem marca de quem paga** | `supabase/migrations/20261001140000_checkin_rollback_condicional.sql:221-227` |
| RN-FC-10 | Com `exigir_pagamento_previo` ligado, a fila considera o saldo das receitas do agendamento | `src/pages/Fila.tsx:285`, `:294-312` |

**Lote**

| ID | Regra | Evidência |
|---|---|---|
| RN-FC-11 | O lote nasce só pela RPC `criar_lote_tiss`, sempre como `rascunho`. A gravação direta na tabela foi revogada | `supabase/migrations/20261011090001_tiss_gravacoes_controladas.sql:5`, `:8-55` |
| RN-FC-12 | Obrigatórios: convênio da clínica, competência no primeiro dia do mês, número, pelo menos 1 guia e valor maior que zero com até 2 casas | `…090001…sql:28-42`; front em `src/pages/FaturamentoConvenios.tsx:112-119` |
| RN-FC-13 | A versão TISS é copiada do convênio no momento da criação, com padrão `04.01.00` | `…090001…sql:37-49`; lista de versões em `src/pages/Convenios.tsx:32` |
| RN-FC-14 | Número do lote único por clínica e convênio | `20260818040000…sql:19`; mensagem em `FaturamentoConvenios.tsx:135-137` |
| RN-FC-15 | **Quantidade de guias e valor apresentado são digitados.** O lote não tem vínculo com atendimentos, guias, pacientes ou lançamentos | `20260818040000…sql:1-20` (sem FK para atendimento) |
| RN-FC-16 | "Baixar resumo XML" gera um XML próprio com número, competência, registro ANS, quantidade e valor, e diz no comentário que "não é arquivo TISS de transmissão" | `FaturamentoConvenios.tsx:333-337` |
| RN-FC-17 | "Registrar envio" só a partir de `rascunho`, com a confirmação "Já enviei pelo canal oficial". Grava `enviado_em` | `…090001…sql:57-84`; `FaturamentoConvenios.tsx:404-429` |
| RN-FC-18 | Um lote em rascunho não pode ser editado nem excluído: não existe RPC nem permissão para isso | `…090001…sql:5`; nenhuma RPC de edição |
| RN-FC-19 | Os status `rejeitado` e `cancelado` existem no CHECK, mas **nenhuma operação leva a eles** | `20260818040000…sql:11`; RPCs em `…090001…sql` e `20261008370000…sql` |

**Retorno do lote**

| ID | Regra | Evidência |
|---|---|---|
| RN-FC-20 | O retorno é registrado só para lotes `enviado`, `processando`, `pago_parcial` ou `pago` | `supabase/migrations/20261008370000_conciliar_retorno_tiss_no_fluxo_financeiro.sql:69-71` |
| RN-FC-21 | O usuário informa o **total acumulado** recebido, entre zero e o valor apresentado, com data não futura | `…370000…sql:55-77`; texto em `FaturamentoConvenios.tsx:446` |
| RN-FC-22 | Status: total igual ao apresentado → `pago`; maior que zero → `pago_parcial`; zero → `processando` | `…370000…sql:99-103` |
| RN-FC-23 | Reduzir o total já registrado exige motivo (mínimo 5 caracteres), que vai para `observacoes` do lote | `:78-85`, `:144-147` |
| RN-FC-24 | Reenviar o mesmo total não grava de novo (idempotência por valor) | `:86-97` |
| RN-FC-25 | Conciliação opcional: só com a caixa marcada, lança em `lancamentos` a diferença entre o total e o já conciliado. Aumento → receita `convenio_repasse` paga; redução → despesa `ajuste_convenio` paga. Ambas com `lote_tiss_id` | `:105-134`; `FaturamentoConvenios.tsx:438-442` |
| RN-FC-26 | A tela avisa quando o recebido difere do conciliado | `FaturamentoConvenios.tsx:66-68`, `:357` |

**Glosa e recurso**

| ID | Regra | Evidência |
|---|---|---|
| RN-FC-27 | A glosa só é registrada em lote já enviado (`enviado`, `processando`, `pago_parcial` ou `pago`) | `supabase/migrations/20261008110000_registrar_glosa_com_limite_atomico.sql:84-86` |
| RN-FC-28 | Obrigatórios: código, motivo e valor maior que zero. A guia de referência é texto livre e opcional | `…110000…sql:55-63`, `:99-104` |
| RN-FC-29 | A soma das glosas não canceladas não passa do valor apresentado do lote, com o lote travado (`FOR UPDATE`) | `:65-68`, `:88-97` |
| RN-FC-30 | Idempotência por chave gerada ao abrir o formulário. Repetição devolve `repetido` | `:39-54`, `:72-83`; `FaturamentoConvenios.tsx:346` |
| RN-FC-31 | Transições: `pendente` → `recurso_preparacao` (justificativa ≥ 10 caracteres, editável) → `recurso_enviado` → `aceita` (valor recuperado entre 0 e o glosado) ou `mantida` (recuperado = 0). Qualquer outra transição é recusada | `…090001…sql:120-147` |
| RN-FC-32 | O status `cancelada` existe e é descontado nas somas, mas **nenhuma operação leva a ele** | `20260818040000…sql:30`; `…110000…sql:93` |
| RN-FC-33 | Glosa aceita não gera lançamento. O valor recuperado só aparece no indicador "Recuperado" | `…090001…sql:142-144`; `FaturamentoConvenios.tsx:91` |
| RN-FC-34 | Não existe "aceitar a glosa sem recurso" (a clínica concorda com a operadora). A glosa fica `pendente` para sempre | RN-FC-31 |

### 2.3 Regras implícitas e casos de borda

| Caso | Comportamento atual | Avaliação |
|---|---|---|
| **Receita em dobro** | O check-in cria receita pendente do paciente pelo preço do convênio (RN-FC-09). O retorno do lote cria outra receita `convenio_repasse` (RN-FC-25). Nada liga uma à outra | Hipótese forte por leitura: o mesmo atendimento aparece duas vezes nas receitas, ou a recepção dá baixa na primeira com a forma "Convênio" (`src/pages/ContasReceber.tsx:79`) sem ter recebido. NÃO VERIFICADO em execução. Lacuna L-FC-01 (P1) |
| Paciente de convênio com pagamento prévio obrigatório | A fila soma o saldo da receita pendente (RN-FC-10), que é o valor do convênio | Hipótese: o paciente de convênio fica bloqueado ou é cobrado no balcão pelo valor que a operadora deveria pagar. NÃO VERIFICADO. Lacuna L-FC-01 |
| Convênio vencido | Check-in normal; a validade não é conferida (RN-FC-04) | O atendimento é faturado e glosado depois. Lacuna L-FC-04 |
| Paciente troca de convênio | O check-in usa o convênio atual do cadastro (RN-FC-05), mesmo que o agendamento tenha sido marcado em outro | Preço e lote do convênio errado. Lacuna L-FC-05 |
| Atendimento cancelado depois de entrar no lote | Não há vínculo, então nada acontece no lote | Lote com valor apresentado errado. Lacuna L-FC-02 |
| Lote digitado errado | Não há edição nem cancelamento (RN-FC-18 e RN-FC-19) | Um erro de digitação no rascunho só se corrige criando outro lote com outro número, e o errado fica para sempre. Lacuna L-FC-06 |
| Operadora rejeita o lote inteiro | Não há como marcar `rejeitado` (RN-FC-19). O contorno é registrar retorno zero, o que deixa o lote em `processando` | Indicador "Apresentado" (`FaturamentoConvenios.tsx:87-88`) segue contando o lote. Lacuna L-FC-06 |
| Glosa registrada em duplicidade ou errada | Não há cancelamento (RN-FC-32) | O total glosado fica inflado. Lacuna L-FC-07 |
| Valor recuperado no recurso | A operadora paga o recuperado num lote ou retorno seguinte. O sistema não liga a glosa aceita ao recebimento (RN-FC-33) | O usuário precisa somar o recuperado no total do lote original à mão. Risco de contar duas vezes ("Pago" e "Recuperado"). Lacuna L-FC-08 |
| Prazo de recurso | Não existe; `convenios.prazo_retorno` não é usado no faturamento (grep sem uso em `FaturamentoConvenios.tsx`) | Recurso perdido por prazo. Prazos regulatórios: requer avaliação especializada. Lacuna L-FC-09 |
| Glosa por guia, item ou paciente | A glosa aponta para o lote; a guia é texto livre (RN-FC-28) | Não há relatório por motivo, profissional ou procedimento. Lacuna L-FC-10 |
| Autorização sem resposta | O status fica `pendente` para sempre (RN-FC-03) | Lacuna L-FC-03; CLIN-QA-023 trata só o texto |
| 20.000 lotes ou glosas ou mais | A tela avisa (`LIMITE_BUSCA_EM_BLOCOS`, `src/lib/buscarEmBlocos.ts:9`) que os indicadores podem estar incompletos (`FaturamentoConvenios.tsx:82-83`, `:358`) | Aceitável no curto prazo |
| Retorno com o valor da parcela em vez do acumulado | A regra pede o acumulado (RN-FC-21). Se o usuário digitar a parcela menor, o sistema exige motivo de redução | O texto ajuda; o risco de erro operacional continua |

## 3. TO-BE

### 3.1 Princípios

1. Um atendimento de convênio gera um **item faturável da operadora**, não uma dívida do paciente. A coparticipação, quando existir, é um item separado do paciente.
2. O lote é **montado a partir dos itens faturáveis** da competência, não digitado. Quantidade e valor são calculados.
3. Glosa, recurso e recuperação apontam para o item (guia/procedimento), e todo valor recebido entra no financeiro uma vez só.
4. TISS XML e validação por XSD vêm depois que o modelo de itens existir (CLIN-QA-529/530). Requer avaliação especializada.

### 3.2 Fluxo TO-BE

```
Agendamento (convênio do agendamento) → check-in confere carteira e validade
   → atendimento realizado → item faturável (operadora, procedimento, valor da tabela, autorização)
   → [coparticipação] item do paciente, separado
Fechamento da competência → lote = seleção de itens do convênio → conferência → (XML TISS validado)
   → envio → retorno por item (pago | glosado)
Glosa por item → aceitar | recorrer (prazo) → decisão → valor recuperado vira recebimento ligado ao item
Financeiro: receita da operadora reconhecida no item; recebimentos conciliados contra os itens
```

### 3.3 Regras TO-BE

| ID | Regra | Muda o quê |
|---|---|---|
| TB-FC-01 | A cobrança do check-in de convênio leva `convenio_id` e um responsável pelo pagamento (`operadora` ou `paciente`). Receita da operadora não entra no saldo da fila nem no caixa do paciente | Fecha L-FC-01. Toca `lancamentos`: decisão do `tech-lead`, respeitando a regra do time |
| TB-FC-02 | Item faturável por atendimento ou procedimento, ligado a agendamento, paciente, convênio, autorização e lote | Base para lote, glosa e TISS |
| TB-FC-03 | O lote é criado a partir dos itens elegíveis da competência; quantidade e valor são calculados e travados no envio | Fecha L-FC-02 |
| TB-FC-04 | Rascunho editável (incluir e retirar itens) e cancelável com motivo; lote enviado pode ser marcado `rejeitado` com motivo, e os itens voltam a ficar elegíveis | Fecha L-FC-06 |
| TB-FC-05 | Glosa por item, com motivo padronizado (tabela de motivos da operadora; requer avaliação especializada) e opção "aceitar sem recurso" | Fecha L-FC-10 e RN-FC-34 |
| TB-FC-06 | Glosa pode ser cancelada com motivo e auditoria | Fecha L-FC-07 |
| TB-FC-07 | Prazo de recurso por convênio, com alerta antes de vencer | Fecha L-FC-09 |
| TB-FC-08 | Valor recuperado gera recebimento ligado à glosa (ou é conciliado contra um retorno), e o indicador não soma duas vezes | Fecha L-FC-08 |
| TB-FC-09 | O check-in alerta quando a carteira está vencida ou quando falta autorização exigida pelo convênio; a recepção decide (particular, remarcar ou seguir com justificativa) | Fecha L-FC-04 |
| TB-FC-10 | O check-in usa o convênio do agendamento; se diverge do cadastro, pergunta | Fecha L-FC-05 |
| TB-FC-11 | Tela para registrar a resposta da autorização (número, validade, negada) e ligar a autorização ao agendamento | Fecha L-FC-03 |
| TB-FC-12 | Relatórios: glosa por convênio, motivo, profissional e procedimento; taxa de glosa real comparada com `convenios.taxa_glosa` | Gestão de glosa |

### 3.4 Critérios de aceite do processo (para o PO e o QA)

- Dado um atendimento de convênio sem coparticipação, quando o check-in é feito com pagamento prévio obrigatório, então o paciente não fica bloqueado e nenhuma receita pendente do paciente é criada.
- Dado um lote com 3 itens, quando o retorno registra o recebimento, então a receita do convênio aparece uma vez só no financeiro.
- Dado um lote em rascunho com um item errado, quando o faturista retira o item, então quantidade e valor são recalculados.
- Dado um paciente com carteira vencida, quando a recepção faz o check-in, então o sistema avisa antes de criar a cobrança.
- Dado um usuário da clínica B, quando tenta registrar glosa num lote da clínica A, então recebe "Lote não encontrado nesta clínica" (já vale hoje: `…110000…sql:65-71`).
- Dado um usuário sem acesso financeiro, quando abre o faturamento ou chama as RPCs, então recebe "Acesso financeiro necessário".

## 4. Multiunidade

| Item | Compartilhado na organização | Isolado por unidade |
|---|---|---|
| Cadastro do convênio, registro ANS e contrato | Em geral sim (contrato da rede) | Há redes com credenciamento por CNPJ de unidade: decisão por convênio |
| Tabela de preços do convênio | Compartilhada, com exceção por unidade | — |
| Lote | — | Sim. O lote sai pelo prestador (CNPJ ou código na operadora) da unidade |
| Glosa e recurso | Visão consolidada para o faturamento central | Executados sobre o lote da unidade |
| Recebimento | Pode cair numa conta central | Conciliado por unidade |

Pré-requisito: CLIN-QA-024. O código do prestador por unidade e o credenciamento requerem avaliação especializada.

## 5. Lacunas

IDs locais. O `product-owner` converte em `CLIN-QA-5xx`.

| ID | Lacuna | Gravidade sugerida | Evidência | Proposta |
|---|---|---|---|---|
| L-FC-00 | Não existe faturamento TISS: o lote é digitado e o XML não é TISS | P1 (comercial) | `FaturamentoConvenios.tsx:333-337` | CLIN-QA-529/530 |
| L-FC-01 | A cobrança do convênio cai como dívida do paciente; possível receita em dobro e bloqueio na fila | **P1** (cobrança errada) | `20261001140000…sql:221-227`; `Fila.tsx:285-312`; `…370000…sql:109-120` | TB-FC-01. Confirmar em homologação antes de priorizar |
| L-FC-02 | O lote não tem vínculo com atendimentos | P1 | `20260818040000…sql:1-20` | TB-FC-02, TB-FC-03 |
| L-FC-03 | Não há como registrar a resposta da autorização | P2 | Nenhum `update` em `autorizacoes_convenio` em `src` | TB-FC-11 |
| L-FC-04 | A validade da carteira não é conferida | P2 | grep de `validade_carteira` | TB-FC-09 |
| L-FC-05 | O check-in usa o convênio do cadastro, não o do agendamento | P2 | `Recepcao.tsx:457,549,595` | TB-FC-10 |
| L-FC-06 | O lote não é editável nem cancelável; `rejeitado` e `cancelado` são inalcançáveis | P2 | `…090001…sql:5`; CHECK em `20260818040000…sql:11` | TB-FC-04 |
| L-FC-07 | A glosa não pode ser cancelada | P2 | CHECK em `20260818040000…sql:30`; transições em `…090001…sql:120-147` | TB-FC-06 |
| L-FC-08 | O recuperado não se liga a recebimento; risco de contar duas vezes | P2 | `…090001…sql:142-144`; `FaturamentoConvenios.tsx:89-91` | TB-FC-08 |
| L-FC-09 | Sem prazo de recurso | P2 | `prazo_retorno` sem uso no faturamento | TB-FC-07 (requer avaliação especializada) |
| L-FC-10 | Glosa por lote, sem item, sem motivo padronizado e sem "aceitar" | P2 | `…110000…sql:99-104`; RN-FC-31 | TB-FC-05 |
| L-FC-11 | A página usa cores fixas em hex (`#d7e9f7`, `#1766a8` e outras) | P3 | `FaturamentoConvenios.tsx:356`, `:361-364` | Tokens do design system (CLIN-QA-031) |

## 6. Glossário (termos deste processo)

| Termo | Significado no EloLab |
|---|---|
| Lote | Registro de um conjunto de guias enviadas a uma operadora numa competência (`lotes_tiss`). Hoje só os totais |
| Competência | Mês de referência do lote, gravado como o dia 1 |
| Valor apresentado | Total cobrado da operadora no lote |
| Retorno | Resposta da operadora com o total pago até o momento |
| Conciliação | Lançar no fluxo de caixa o que foi recebido do lote (`valor_conciliado_financeiro`) |
| Glosa | Valor recusado pela operadora, com código e motivo |
| Recurso | Contestação da glosa, com justificativa |
| Valor recuperado | Parte da glosa revertida no recurso |

## 7. Repasse

- `product-owner`: L-FC-01 primeiro (confirmar em homologação e virar história P1), depois L-FC-02 como fundação de CLIN-QA-530.
- `especialista-dominio-saude`: versão TISS vigente, prazos de envio e de recurso, tabela de motivos de glosa e coparticipação. Requer avaliação especializada.
- `software-architect`: modelo de item faturável (TB-FC-02) e onde ele encosta em `lancamentos`.
- `qa-engineer`: critérios da seção 3.4, começando pelo de receita em dobro.
